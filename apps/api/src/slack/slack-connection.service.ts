import { isSlackConfigured, WORKSPACE_ID } from "@crm/auth";
import type { Db } from "@crm/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";

const PEOPLE_SYNC_ACTIVE_MS = 30_000;

@Injectable()
export class SlackConnectionService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async status() {
		const [account, agents, matches, memberCount] = await Promise.all([
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
				},
				orderBy: { updatedAt: "desc" },
				take: 30,
				select: {
					id: true,
					name: true,
					description: true,
					status: true,
					currentVersion: { select: { manifest: true } },
				},
			}),
			this.db.slackMemberMatch.findMany({
				where: {
					crmUser: { members: { some: { organizationId: WORKSPACE_ID } } },
				},
				select: { slackUserId: true, updatedAt: true },
			}),
			this.db.member.count({ where: { organizationId: WORKSPACE_ID } }),
		]);

		const linkedAgents = agents
			.filter((agent) => usesSlack(agent.currentVersion?.manifest))
			.map(({ currentVersion: _, ...agent }) => agent);
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
			workspace: account ? "Slack workspace" : null,
			lastConnectedAt: account?.updatedAt.toISOString() ?? null,
			scopes: (account?.scope ?? "")
				.split(",")
				.map((scope) => scope.trim())
				.filter(Boolean),
			agents: linkedAgents,
			people: { matched, reviewed },
		};
	}

	async matches() {
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
			this.db.agentTask.findFirst({
				where: { kind: "slack-people-match", finishedAt: null },
				orderBy: { createdAt: "desc" },
				select: { createdAt: true },
			}),
		]);

		return {
			rows: members.map(({ user }) => ({
				crmUserId: user.id,
				name: user.name,
				email: user.email,
				match: user.slackMemberMatch,
			})),
			syncing: Boolean(
				syncing &&
					Date.now() - syncing.createdAt.getTime() < PEOPLE_SYNC_ACTIVE_MS,
			),
		};
	}

	async refreshPeople() {
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

	async disconnect() {
		const removed = await this.db.$transaction(async (tx) => {
			const accounts = await tx.account.deleteMany({
				where: { providerId: "slack" },
			});
			await tx.slackChannel.deleteMany({});
			return accounts.count;
		});

		if (removed === 0) throw new NotFoundException("Slack is not connected.");

		return { disconnected: true };
	}
}

function usesSlack(manifest: unknown): boolean {
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		return false;
	}
	const dataScope = Reflect.get(manifest, "dataScope");
	if (!dataScope || typeof dataScope !== "object" || Array.isArray(dataScope)) {
		return false;
	}
	const resources = Reflect.get(dataScope, "resources");
	return (
		Array.isArray(resources) &&
		resources.some(
			(resource) =>
				resource &&
				typeof resource === "object" &&
				Reflect.get(resource, "id") === "slack:workspace",
		)
	);
}
