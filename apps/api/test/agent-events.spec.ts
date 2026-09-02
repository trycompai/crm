import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";

const suffix = crypto.randomUUID();
const dealId = `event-deal-${suffix}`;
const contactId = `event-contact-${suffix}`;
const companyId = `event-company-${suffix}`;
const service = new AgentTriggerService(db);
const stamp = new ActivityStampService(db);
const conversion = new ConversionService(db);
const fields = new FieldsService(db, service);
const deals = new DealsService(db, service, stamp, conversion, fields);
const channelId = `event-channel-${suffix}`;
const ownerId = `event-owner-${suffix}`;
const domain = `event-${suffix}.example.test`;
let persistedCompanyId = "";
let persistedDealId = "";
let previousBridgeSecret: string | undefined;

beforeAll(async () => {
	previousBridgeSecret = process.env.AGENT_BRIDGE_SECRET;
	delete process.env.AGENT_BRIDGE_SECRET;
	await db.agentTask.deleteMany({
		where: { OR: [{ dealId }, { contactId }] },
	});
	await db.user.create({
		data: {
			id: ownerId,
			name: "Event Test Owner",
			email: `${ownerId}@example.test`,
		},
	});
	const company = await db.company.create({
		data: { name: "Event Test Company", domain },
		select: { id: true },
	});
	persistedCompanyId = company.id;
});

afterAll(async () => {
	await db.slackEventInbox.deleteMany({
		where: { eventId: { startsWith: `Ev-${suffix}-` } },
	});
	await db.agentTask.deleteMany({
		where: {
			OR: [
				{ dealId: { in: [dealId, persistedDealId].filter(Boolean) } },
				{ contactId },
			],
		},
	});
	await db.agentTask.deleteMany({
		where: {
			kind: "slack-channel-join",
			payload: { path: ["channelId"], equals: channelId },
		},
	});
	if (persistedDealId) {
		await db.activity.deleteMany({ where: { dealId: persistedDealId } });
		await db.deal.deleteMany({ where: { id: persistedDealId } });
	}
	if (persistedCompanyId) {
		await db.company.deleteMany({ where: { id: persistedCompanyId } });
	}
	await db.user.deleteMany({ where: { id: ownerId } });
	if (previousBridgeSecret === undefined) {
		delete process.env.AGENT_BRIDGE_SECRET;
	} else {
		process.env.AGENT_BRIDGE_SECRET = previousBridgeSecret;
	}
});

describe("CRM agent events", () => {
	it("routes every event to its catalog record kind", async () => {
		const occurredAt = new Date("2026-08-10T09:00:00.000Z");
		await service.withCrmEvents(async (_tx, emit) => {
			await emit({
				type: "contact.created",
				record: { kind: "contact", id: contactId },
				occurredAt,
				data: { email: "person@example.test" },
			});
		});

		expect(
			await db.agentTask.findFirstOrThrow({
				where: { contactId, kind: "agent-event" },
				select: {
					contactId: true,
					companyId: true,
					dealId: true,
					payload: true,
				},
			}),
		).toEqual({
			contactId,
			companyId: null,
			dealId: null,
			payload: {
				type: "contact.created",
				record: { kind: "contact", id: contactId },
				occurredAt: occurredAt.toISOString(),
				data: { email: "person@example.test" },
			},
		});
	});

	it("writes durable created and closed events for the agent worker", async () => {
		const createdAt = new Date("2026-08-10T10:00:00.000Z");
		const closedAt = new Date("2026-08-10T11:00:00.000Z");

		await service.withCrmEvents(async (_tx, emit) => {
			await emit({
				type: "deal.created",
				record: { kind: "deal", id: dealId },
				occurredAt: createdAt,
				data: { companyId, stage: "DEMO_BOOKED" },
			});
			await emit({
				type: "deal.closed",
				record: { kind: "deal", id: dealId },
				occurredAt: closedAt,
				data: { companyId, from: "NEGOTIATION", to: "CLOSED_WON" },
			});
		});

		const tasks = await db.agentTask.findMany({
			where: { dealId, kind: "agent-event" },
			select: {
				dealId: true,
				reason: true,
				payload: true,
				finishedAt: true,
			},
		});

		expect(tasks).toHaveLength(2);
		expect(tasks.find((task) => task.reason === "deal.created")).toEqual({
			dealId,
			reason: "deal.created",
			payload: {
				type: "deal.created",
				record: { kind: "deal", id: dealId },
				occurredAt: createdAt.toISOString(),
				data: { companyId, stage: "DEMO_BOOKED" },
			},
			finishedAt: null,
		});
		expect(tasks.find((task) => task.reason === "deal.closed")).toEqual({
			dealId,
			reason: "deal.closed",
			payload: {
				type: "deal.closed",
				record: { kind: "deal", id: dealId },
				occurredAt: closedAt.toISOString(),
				data: { companyId, from: "NEGOTIATION", to: "CLOSED_WON" },
			},
			finishedAt: null,
		});
	});

	it("queues one Slack join for a channel that is renamed", async () => {
		await service.slackChannelJoinRequested(channelId, "deal-room");
		await service.slackChannelJoinRequested(channelId, "deal-room-renamed");

		expect(
			await db.agentTask.findMany({
				where: {
					kind: "slack-channel-join",
					payload: { path: ["channelId"], equals: channelId },
				},
				select: { reason: true },
			}),
		).toEqual([{ reason: "Add Comp AI to #deal-room" }]);
	});

	it("rolls back the record when its event cannot commit", async () => {
		const rollbackCompanyId = `event-rollback-company-${suffix}`;
		let error: Error | null = null;

		try {
			await service.withCrmEvents(async (tx, emit) => {
				const company = await tx.company.create({
					data: {
						id: rollbackCompanyId,
						name: "Rollback Event Company",
					},
					select: { id: true, createdAt: true },
				});
				await emit({
					type: "company.created",
					record: { kind: "company", id: company.id },
					occurredAt: company.createdAt,
					data: { name: "Rollback Event Company", domain: null },
				});
				throw new Error("Rollback the record and outbox together.");
			});
		} catch (caught) {
			error = caught as Error;
		}

		expect(error?.message).toBe("Rollback the record and outbox together.");
		expect(
			await db.company.findUnique({ where: { id: rollbackCompanyId } }),
		).toBeNull();
		expect(
			await db.agentTask.count({
				where: { companyId: rollbackCompanyId, kind: "agent-event" },
			}),
		).toBe(0);
	});

	it("emits each real deal lifecycle transition exactly once", async () => {
		const deal = await deals.create({
			name: "Event-driven deal",
			companyId: persistedCompanyId,
			ownerId,
			amountCents: 25_000,
			currency: "USD",
		});
		persistedDealId = deal.id;

		const transitions = await Promise.all([
			deals.setStage({ id: deal.id, stage: "CLOSED_WON" }, ownerId),
			deals.setStage({ id: deal.id, stage: "CLOSED_WON" }, ownerId),
		]);

		expect(transitions.map((transition) => transition.changed).sort()).toEqual([
			false,
			true,
		]);
		await deals.setStage({ id: deal.id, stage: "QUALIFIED_TO_BUY" }, ownerId);

		const reasons = (
			await db.agentTask.findMany({
				where: { dealId: deal.id, kind: "agent-event" },
				select: { reason: true },
			})
		)
			.map((task) => task.reason)
			.sort();
		expect(reasons).toEqual([
			"deal.closed",
			"deal.created",
			"deal.opened",
			"deal.stage.changed",
			"deal.stage.changed",
		]);
		expect(
			await db.activity.count({
				where: { dealId: deal.id, type: "STAGE_CHANGE" },
			}),
		).toBe(2);
	});
});

describe("Slack event inbox writes", () => {
	it("stores a Slack event once and treats a duplicate as already seen", async () => {
		const eventId = `Ev-${suffix}-dup`;
		const payload = { type: "event_callback", event_id: eventId };

		expect(
			await service.slackEventReceived({
				eventId,
				type: "message",
				payload,
			}),
		).toEqual({ stored: true });
		expect(
			await service.slackEventReceived({
				eventId,
				type: "message",
				payload,
			}),
		).toEqual({ stored: false });
	});

	it("rethrows a Slack inbox write that is not a duplicate", async () => {
		const original = db.slackEventInbox.create.bind(db.slackEventInbox);
		db.slackEventInbox.create = (async () => {
			throw new Error("the inbox is unreachable");
		}) as typeof db.slackEventInbox.create;

		try {
			await expect(
				service.slackEventReceived({
					eventId: `Ev-${suffix}-fail`,
					type: "message",
					payload: { type: "event_callback" },
				}),
			).rejects.toThrow("the inbox is unreachable");
		} finally {
			db.slackEventInbox.create = original;
		}
	});
});
