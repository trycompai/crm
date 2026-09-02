import { describe, expect, it } from "bun:test";
import type { WorkspaceRole } from "@crm/auth";
import type { Db } from "@crm/db";
import type { AgentAccessService } from "../src/agent/agent-access.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { SlackChannelsService } from "../src/slack/slack-channels.service";
import { SLACK } from "../src/slack/slack-config";
import { SlackConnectionService } from "../src/slack/slack-connection.service";

const userId = "crm-1";

function serviceFor(input: {
	accountUpdatedAt?: Date;
	matches?: Array<{ slackUserId: string | null; updatedAt: Date }>;
	members?: Array<{
		user: {
			id: string;
			name: string;
			email: string;
			slackMemberMatch: {
				slackUserId: string | null;
				slackHandle: string | null;
				slackEmail: string | null;
			} | null;
		};
	}>;
	memberCount?: number;
	agents?: unknown[];
	syncingTask?: {
		createdAt: Date;
		startedAt: Date | null;
		leasedUntil: Date | null;
	};
	lastFill?: { finishedAt: Date | null };
	grant?: boolean;
	role?: WorkspaceRole;
	channels?: Array<{
		id: string;
		name: string;
		memberCount: number;
		isPrivate: boolean;
		isMember: boolean;
		classifiedAt: Date | null;
		inviteRequestedAt: Date | null;
	}>;
}) {
	const requested: Array<{ reason: string; required: boolean | undefined }> =
		[];
	const deleted: string[] = [];
	const tx = {
		account: {
			deleteMany: async () => {
				deleted.push("account");
				return { count: input.accountUpdatedAt ? 1 : 0 };
			},
		},
		slackChannel: {
			deleteMany: async () => {
				deleted.push("slackChannel");
				return { count: 0 };
			},
		},
		slackWorkspaceGrant: {
			deleteMany: async () => {
				deleted.push("slackWorkspaceGrant");
				return { count: 0 };
			},
		},
	};
	const db = {
		$transaction: async <T>(run: (client: typeof tx) => Promise<T>) => run(tx),
		account: {
			findFirst: async () =>
				input.accountUpdatedAt
					? {
							id: "account-1",
							accountId: "slack-user",
							updatedAt: input.accountUpdatedAt,
						}
					: null,
		},
		agentDefinition: { findMany: async () => input.agents ?? [] },
		slackMemberMatch: { findMany: async () => input.matches ?? [] },
		slackWorkspaceGrant: {
			findFirst: async () => (input.grant ? { id: "grant-1" } : null),
		},
		member: {
			count: async () => input.memberCount ?? 0,
			findMany: async () => input.members ?? [],
		},
		agentTask: {
			findFirst: async (args: { where: { finishedAt?: null } }) =>
				args.where.finishedAt === null
					? (input.syncingTask ?? null)
					: (input.lastFill ?? null),
		},
		slackChannel: {
			findMany: async () => input.channels ?? [],
		},
	} as unknown as Db;
	const agent = {
		slackPeopleRequested: async (reason: string, required?: boolean) => {
			requested.push({ reason, required });
		},
	} as AgentTriggerService;
	const channels = {} as SlackChannelsService;
	const access = {
		assertMember: async () => input.role ?? "member",
	} as unknown as AgentAccessService;

	return {
		service: new SlackConnectionService(db, agent, channels, access),
		requested,
		deleted,
	};
}

describe("Slack connection", () => {
	it("requests one inventory refresh when the connected account is newer", async () => {
		const connectedAt = new Date("2026-08-10T10:00:00.000Z");
		const { service, requested } = serviceFor({
			accountUpdatedAt: connectedAt,
			memberCount: 2,
			matches: [
				{
					slackUserId: "U1",
					updatedAt: new Date("2026-08-10T09:00:00.000Z"),
				},
			],
		});

		const status = await service.status(userId);

		expect(status.connected).toBe(true);
		expect(status.people).toEqual({ matched: 1, reviewed: 1 });
		expect(requested).toEqual([
			{
				reason: "Match workspace members to Slack accounts by exact email",
				required: undefined,
			},
		]);
	});

	it("does not refresh a complete inventory that was read after connecting", async () => {
		const connectedAt = new Date("2026-08-10T10:00:00.000Z");
		const reviewedAt = new Date("2026-08-10T10:00:01.000Z");
		const { service, requested } = serviceFor({
			accountUpdatedAt: connectedAt,
			memberCount: 2,
			matches: [
				{ slackUserId: "U1", updatedAt: reviewedAt },
				{ slackUserId: null, updatedAt: reviewedAt },
			],
		});

		const status = await service.status(userId);

		expect(status.people).toEqual({ matched: 1, reviewed: 2 });
		expect(requested).toEqual([]);
	});

	it("returns only real CRM members and their stored exact-email matches", async () => {
		const { service } = serviceFor({
			members: [
				{
					user: {
						id: "crm-1",
						name: "Grim",
						email: "grim@example.test",
						slackMemberMatch: {
							slackUserId: "U1",
							slackHandle: "@grim",
							slackEmail: "grim@example.test",
						},
					},
				},
			],
			syncingTask: {
				createdAt: new Date(),
				startedAt: null,
				leasedUntil: null,
			},
		});

		expect(await service.matches(userId)).toEqual({
			rows: [
				{
					crmUserId: "crm-1",
					name: "Grim",
					email: "grim@example.test",
					match: {
						slackUserId: "U1",
						slackHandle: "@grim",
						slackEmail: "grim@example.test",
					},
				},
			],
			sync: "syncing",
		});
	});

	it("reports a stalled sync when nothing picks the task up", async () => {
		const { service } = serviceFor({
			syncingTask: {
				createdAt: new Date(Date.now() - 10 * 60_000),
				startedAt: null,
				leasedUntil: null,
			},
		});

		expect((await service.matches(userId)).sync).toBe("stalled");
	});

	it("reports a running sync while the agent holds the lease", async () => {
		const { service } = serviceFor({
			syncingTask: {
				createdAt: new Date(Date.now() - 10 * 60_000),
				startedAt: null,
				leasedUntil: new Date(Date.now() + 60_000),
			},
		});

		expect((await service.matches(userId)).sync).toBe("syncing");
	});

	it("reports an idle sync when no task waits", async () => {
		const { service } = serviceFor({});

		expect((await service.matches(userId)).sync).toBe("idle");
	});

	it("refuses to disconnect the workspace for a member", async () => {
		const { service, deleted } = serviceFor({
			accountUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
			role: "member",
		});

		await expect(service.disconnect(userId)).rejects.toThrow(
			"Only an owner or an admin can disconnect Slack.",
		);
		expect(deleted).toEqual([]);
	});

	it("tells a member that they cannot disconnect", async () => {
		const { service } = serviceFor({
			accountUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
			role: "member",
		});

		expect((await service.status(userId)).canManage).toBe(false);
	});

	it("disconnects the workspace for an admin", async () => {
		const { service, deleted } = serviceFor({
			accountUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
			role: "admin",
		});

		expect(await service.disconnect(userId)).toEqual({ disconnected: true });
		expect(deleted).toEqual(["account", "slackChannel", "slackWorkspaceGrant"]);
	});
});

const channel = {
	id: "C1",
	name: "deals",
	memberCount: 2,
	isPrivate: false,
	isMember: true,
	classifiedAt: new Date("2026-08-10T10:00:00.000Z"),
	inviteRequestedAt: null,
};

describe("Slack channel inventory", () => {
	it("asks for the inventory when a connected workspace has no channels", async () => {
		const { service, requested } = serviceFor({
			accountUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
			channels: [],
		});

		const result = await service.channels({}, userId);

		expect(result.rows).toEqual([]);
		expect(result.sync).toBe("syncing");
		expect(requested).toEqual([
			{
				reason: "Fill the Slack channel inventory for the connections page",
				required: undefined,
			},
		]);
	});

	it("leaves a filled inventory alone", async () => {
		const { service, requested } = serviceFor({
			accountUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
			channels: [channel],
		});

		const result = await service.channels({}, userId);

		expect(result.rows).toHaveLength(1);
		expect(result.sync).toBe("idle");
		expect(requested).toEqual([]);
	});

	it("reads a search that matches nothing as a search, not a missing inventory", async () => {
		const { service, requested } = serviceFor({
			accountUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
			channels: [],
		});

		const result = await service.channels({ query: "nothing" }, userId);

		expect(result.sync).toBe("idle");
		expect(requested).toEqual([]);
	});

	it("asks for nothing when Slack is not connected", async () => {
		const { service, requested } = serviceFor({ channels: [] });

		const result = await service.channels({}, userId);

		expect(result.sync).toBe("idle");
		expect(requested).toEqual([]);
	});

	it("reports an empty workspace as empty once a fill has just finished", async () => {
		const { service, requested } = serviceFor({
			accountUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
			channels: [],
			lastFill: { finishedAt: new Date() },
		});

		const result = await service.channels({}, userId);

		expect(result.rows).toEqual([]);
		expect(result.sync).toBe("idle");
		expect(requested).toEqual([]);
	});

	it("asks for a fill when the last one finished before this connection", async () => {
		const { service, requested } = serviceFor({
			accountUpdatedAt: new Date(),
			channels: [],
			lastFill: { finishedAt: new Date(Date.now() - 60_000) },
		});

		const result = await service.channels({}, userId);

		expect(result.sync).toBe("syncing");
		expect(requested).toHaveLength(1);
	});

	it("asks again when the last fill is older than the refill window", async () => {
		const { service, requested } = serviceFor({
			accountUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
			channels: [],
			lastFill: {
				finishedAt: new Date(Date.now() - SLACK.inventory.refillAfterMs),
			},
		});

		const result = await service.channels({}, userId);

		expect(result.sync).toBe("syncing");
		expect(requested).toHaveLength(1);
	});
});
