import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { dealUpdateArgs } from "../src/deals/deals.contracts";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "deals-spec";
const ownerId = `owner-${suffix}`;
const domain = `deals-${suffix}.test`;

const agent = {
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;

const deals = new DealsService(
	db,
	agent,
	new ActivityStampService(db),
	new ConversionService(db),
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
);

let companyId: string;
let dealId: string;

async function clean() {
	await db.deal.deleteMany({ where: { company: { domain } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: ownerId } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: {
			id: ownerId,
			name: "Booking Rep",
			email: `${ownerId}@example.test`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `Booking Co ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	const deal = await deals.create({
		name: `Event booking ${suffix}`,
		companyId,
		ownerId,
		amountCents: 250_000,
		currency: "USD",
	});
	dealId = deal.id;
});

afterAll(clean);

describe("deal booking status fields", () => {
	it("starts existing deals on safe booking defaults", async () => {
		const deal = await deals.byId(dealId);

		expect(deal).toMatchObject({
			quoteStatus: "NOT_READY",
			invoiceStatus: "NOT_REQUESTED",
			paymentStatus: "UNPAID",
			calendarStatus: "NOT_ADDED",
			googleCalendarEventId: null,
			quoteSentAt: null,
			invoiceRequestedAt: null,
			invoiceSentAt: null,
			depositPaidAt: null,
			fullyPaidAt: null,
			calendarAddedAt: null,
			depositAmountCents: null,
			balanceAmountCents: null,
		});
	});

	it("updates booking fields through the existing deal update contract", async () => {
		const quoteSentAt = "2026-08-28T09:10:11.000Z";
		const invoiceRequestedAt = "2026-08-28T09:20:00.000Z";
		const depositPaidAt = "2026-08-28T10:00:00.000Z";
		const calendarAddedAt = "2026-08-28T10:30:00.000Z";

		const input = dealUpdateArgs.parse({
			id: dealId,
			data: {
				name: `Updated event booking ${suffix}`,
				amountCents: 375_000,
				currency: "USD",
				quoteStatus: "SENT",
				quoteSentAt,
				invoiceStatus: "REQUESTED",
				invoiceRequestedAt,
				paymentStatus: "DEPOSIT_PAID",
				depositPaidAt,
				depositAmountCents: 125_000,
				balanceAmountCents: 250_000,
				calendarStatus: "ADDED",
				calendarAddedAt,
				googleCalendarEventId: "event-props-calendar-id",
			},
		});

		await deals.update(input.id, input.data);

		const deal = await deals.byId(dealId);

		expect(deal).toMatchObject({
			name: `Updated event booking ${suffix}`,
			amountCents: 375_000,
			currency: "USD",
			quoteStatus: "SENT",
			quoteSentAt,
			invoiceStatus: "REQUESTED",
			invoiceRequestedAt,
			paymentStatus: "DEPOSIT_PAID",
			depositPaidAt,
			depositAmountCents: 125_000,
			balanceAmountCents: 250_000,
			calendarStatus: "ADDED",
			calendarAddedAt,
			googleCalendarEventId: "event-props-calendar-id",
		});
	});

	it("lets calendar failure change independently from booked stage", async () => {
		await deals.setStage({ id: dealId, stage: "CLOSED_WON" }, ownerId);

		await deals.update(dealId, {
			calendarStatus: "FAILED",
			calendarAddedAt: null,
			googleCalendarEventId: null,
		});

		const deal = await deals.byId(dealId);

		expect(deal.stage).toBe("CLOSED_WON");
		expect(deal.calendarStatus).toBe("FAILED");
		expect(deal.calendarAddedAt).toBeNull();
		expect(deal.googleCalendarEventId).toBeNull();
	});
});
