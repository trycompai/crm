import {
	canManageConnections,
	isSlackConfigured,
	WORKSPACE_ID,
} from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import { schemas } from "@crm/validation";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { AgentAccessService } from "../agent/agent-access.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	SlackChannelsInput,
	SlackChannelsResult,
	SlackCreateChannelInput,
	SlackCreateChannelResult,
	SlackDisconnectResult,
	SlackJoinChannelInput,
	SlackJoinChannelResult,
	SlackMatches,
	SlackRefreshPeopleResult,
	SlackStatus,
} from "./slack.contracts";
import { SlackChannelsService } from "./slack-channels.service";
import { SLACK, type SlackSyncState } from "./slack-config";

const SLACK_WORKSPACE_RESOURCE_ID =
	schemas.agents.CAPABILITY_RESOURCE_IDS.slack;

function refillDue(filledAt: Date | null, connectedAt: Date): boolean {
	if (!filledAt || filledAt < connectedAt) return true;
	return Date.now() - filledAt.getTime() >= SLACK.inventory.refillAfterMs;
}

@Injectable()
export class SlackConnectionService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly slackChannels: SlackChannelsService,
		private readonly access: AgentAccessService,
	) {}

	async status(userId: string): Promise<SlackStatus> {
		const role = await this.access.assertMember(userId);
		const [account, agents, matches, memberCount, grant] = await Promise.all([
			this.db.account.findFirst({
				where: { providerId: "slack", accessToken: { not: null } },
				orderBy: { updatedAt: "desc" },
				select: { accountId: true, updatedAt: true, scope: true },
			}),
			this.db.agentDefinition.findMany({
				where: {
					status: { in: ["LIVE", "PAUSED"] },
					deletedAt: null,
					currentVersionId: { not: null },
					currentVersion: {
						manifest: {
							path: ["dataScope", "resources"],
							array_contains: [{ id: SLACK_WORKSPACE_RESOURCE_ID }],
						},
					},
				},
				orderBy: { updatedAt: "desc" },
				take: 30,
				select: { id: true, name: true, description: true, status: true },
			}),
			this.db.slackMemberMatch.findMany({
				where: {
					crmUser: { members: { some: { organizationId: WORKSPACE_ID } } },
				},
				select: { slackUserId: true, updatedAt: true },
			}),
			this.db.member.count({ where: { organizationId: WORKSPACE_ID } }),
			this.db.slackWorkspaceGrant.findFirst({
				select: { id: true, teamName: true },
			}),
		]);

		const matched = matches.filter((match) => match.slackUserId).length;
		const reviewed = matches.length;
		const inventoryFresh =
			account &&
			reviewed === memberCount &&
			matches.every((match) => match.updatedAt >= account.updatedAt);
		if (account && !inventoryFresh) {
			await this.agent.slackPeopleRequested(
				"Match workspace members to Slack accounts by exact email",
			);
		}

		return {
			configured: isSlackConfigured(),
			connected: Boolean(account),
			workspace: account ? (grant?.teamName ?? null) : null,
			lastConnectedAt: account?.updatedAt.toISOString() ?? null,
			scopes: (account?.scope ?? "")
				.split(",")
				.map((scope) => scope.trim())
				.filter(Boolean),
			canInviteItself: Boolean(grant),
			canManage: canManageConnections(role),
			agents,
			people: { matched, reviewed },
		};
	}

	async matches(userId: string): Promise<SlackMatches> {
		await this.access.assertMember(userId);
		const [members, syncing] = await Promise.all([
			this.db.member.findMany({
				where: { organizationId: WORKSPACE_ID },
				orderBy: { user: { name: "asc" } },
				select: {
					user: {
						select: {
							id: true,
							name: true,
							email: true,
							slackMemberMatch: {
								select: {
									slackUserId: true,
									slackHandle: true,
									slackEmail: true,
								},
							},
						},
					},
				},
			}),
			this.peopleSyncState(),
		]);

		return {
			rows: members.map(({ user }) => ({
				crmUserId: user.id,
				name: user.name,
				email: user.email,
				match: user.slackMemberMatch,
			})),
			sync: syncing,
		};
	}

	private async peopleSyncState(): Promise<SlackSyncState> {
		const pending = await this.db.agentTask.findFirst({
			where: { kind: "slack-people-match", finishedAt: null },
			orderBy: { createdAt: "desc" },
			select: { createdAt: true, startedAt: true, leasedUntil: true },
		});
		if (!pending) return "idle";

		const now = Date.now();
		const leaseHeld = pending.leasedUntil
			? pending.leasedUntil.getTime() > now
			: false;
		if (leaseHeld || pending.startedAt) return "syncing";

		return now - pending.createdAt.getTime() < SLACK.sync.stalledAfterMs
			? "syncing"
			: "stalled";
	}

	async refreshPeople(userId: string): Promise<SlackRefreshPeopleResult> {
		await this.access.assertMember(userId);
		const account = await this.db.account.findFirst({
			where: { providerId: "slack", accessToken: { not: null } },
			orderBy: { updatedAt: "desc" },
			select: { id: true },
		});
		if (!account) throw new NotFoundException("Slack is not connected.");

		await this.agent.slackPeopleRequested(
			"Refresh Slack people and channels from the connection page",
			true,
		);

		return { requested: true };
	}

	async channels(
		input: SlackChannelsInput,
		userId: string,
	): Promise<SlackChannelsResult> {
		await this.access.assertMember(userId);

		const take = input.limit ?? SLACK.channels.pageSize;
		const needle = input.query?.trim() ?? "";

		const where: Prisma.SlackChannelWhereInput = { available: true };
		if (needle) where.name = { contains: needle, mode: "insensitive" };

		const [rows, grant, sync, lastFill] = await Promise.all([
			this.db.slackChannel.findMany({
				where,
				orderBy: [{ isMember: "desc" }, { name: "asc" }, { id: "asc" }],
				take: take + 1,
				cursor: input.cursor ? { id: input.cursor } : undefined,
				skip: input.cursor ? 1 : undefined,
				select: {
					id: true,
					name: true,
					memberCount: true,
					isPrivate: true,
					isMember: true,
					classifiedAt: true,
					inviteRequestedAt: true,
				},
			}),
			this.db.slackWorkspaceGrant.findFirst({ select: { id: true } }),
			this.peopleSyncState(),
			this.db.agentTask.findFirst({
				where: { kind: "slack-people-match", finishedAt: { not: null } },
				orderBy: { finishedAt: "desc" },
				select: { finishedAt: true },
			}),
		]);

		const page = rows.slice(0, take);
		const empty = sync === "idle" && !needle && page.length === 0;
		const account = empty
			? await this.db.account.findFirst({
					where: { providerId: "slack", accessToken: { not: null } },
					orderBy: { updatedAt: "desc" },
					select: { updatedAt: true },
				})
			: null;
		const missing =
			account !== null &&
			refillDue(lastFill?.finishedAt ?? null, account.updatedAt);
		if (missing) {
			await this.agent.slackPeopleRequested(
				"Fill the Slack channel inventory for the connections page",
			);
		}

		return {
			canInviteItself: Boolean(grant),
			sync: missing ? "syncing" : sync,
			nextCursor: rows.length > take ? (page.at(-1)?.id ?? null) : null,
			rows: page.map(({ classifiedAt, ...row }) => ({
				...row,
				classified: classifiedAt !== null,
				inviteRequestedAt: row.inviteRequestedAt?.toISOString() ?? null,
			})),
		};
	}

	async joinChannel(
		input: SlackJoinChannelInput,
		userId: string,
	): Promise<SlackJoinChannelResult> {
		await this.access.assertMember(userId);
		const channel = await this.db.slackChannel.findUnique({
			where: { id: input.channelId },
			select: { id: true, name: true, isMember: true, isPrivate: true },
		});
		if (!channel) throw new NotFoundException("No such Slack channel.");
		if (channel.isMember) return { queued: false, alreadyJoined: true };

		const grant = await this.db.slackWorkspaceGrant.findFirst({
			select: { id: true },
		});
		if (channel.isPrivate && !grant) {
			await this.db.slackChannel.update({
				where: { id: channel.id },
				data: { inviteRequestedAt: new Date() },
			});
			return { queued: false, alreadyJoined: false };
		}

		await this.agent.slackChannelJoinRequested(channel.id, channel.name);
		return { queued: true, alreadyJoined: false };
	}

	async createChannel(
		input: SlackCreateChannelInput,
		userId: string,
	): Promise<SlackCreateChannelResult> {
		await this.access.assertMember(userId);
		const existing = await this.db.slackChannel.findFirst({
			where: { name: input.name },
			select: { id: true },
		});
		if (existing) {
			throw new BadRequestException("A channel with that name already exists.");
		}

		return this.slackChannels.create(input.name, input.isPrivate);
	}

	async disconnect(userId: string): Promise<SlackDisconnectResult> {
		const role = await this.access.assertMember(userId);

		if (!canManageConnections(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can disconnect Slack.",
			);
		}

		const removed = await this.db.$transaction(async (tx) => {
			const accounts = await tx.account.deleteMany({
				where: { providerId: "slack" },
			});
			await tx.slackChannel.deleteMany({});
			await tx.slackWorkspaceGrant.deleteMany({});
			return accounts.count;
		});

		if (removed === 0) throw new NotFoundException("Slack is not connected.");

		return { disconnected: true };
	}
}
