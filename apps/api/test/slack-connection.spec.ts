import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { SlackConnectionService } from "../src/slack/slack-connection.service";

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
	syncingCreatedAt?: Date;
}) {
	const requested: Array<{ reason: string; required: boolean | undefined }> =
		[];
	const db = {
		account: {
			findFirst: async () =>
				input.accountUpdatedAt
					? { accountId: "slack-user", updatedAt: input.accountUpdatedAt }
					: null,
		},
		agentDefinition: { findMany: async () => input.agents ?? [] },
		slackMemberMatch: { findMany: async () => input.matches ?? [] },
		member: {
			count: async () => input.memberCount ?? 0,
			findMany: async () => input.members ?? [],
		},
		agentTask: {
			findFirst: async () =>
				input.syncingCreatedAt ? { createdAt: input.syncingCreatedAt } : null,
		},
	} as unknown as Db;
	const agent = {
		slackPeopleRequested: async (reason: string, required?: boolean) => {
			requested.push({ reason, required });
		},
	} as AgentTriggerService;

	return { service: new SlackConnectionService(db, agent), requested };
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

		const status = await service.status();

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

		const status = await service.status();

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
			syncingCreatedAt: new Date(),
		});

		expect(await service.matches()).toEqual({
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
			syncing: true,
		});
	});
});
