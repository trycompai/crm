import { describe, expect, it } from "bun:test";
import { dealUpdateArgs } from "../src/deals/deals.contracts";

describe("deal update contract", () => {
	it("accepts operational booking fields on the existing update payload", () => {
		const parsed = dealUpdateArgs.parse({
			id: "deal_123",
			data: {
				quoteStatus: "SENT",
				quoteSentAt: "2026-08-28T09:10:11.000Z",
				invoiceStatus: "REQUESTED",
				invoiceRequestedAt: "2026-08-28T09:20:00.000Z",
				paymentStatus: "DEPOSIT_PAID",
				depositAmountCents: 125_000,
				calendarStatus: "ADDED",
				calendarAddedAt: "2026-08-28T10:30:00.000Z",
				googleCalendarEventId: "event-props-calendar-id",
			},
		});

		expect(parsed.data).toMatchObject({
			quoteStatus: "SENT",
			invoiceStatus: "REQUESTED",
			paymentStatus: "DEPOSIT_PAID",
			calendarStatus: "ADDED",
			depositAmountCents: 125_000,
			googleCalendarEventId: "event-props-calendar-id",
		});
	});

	it("rejects operational booking statuses outside the allowed values", () => {
		const parsed = dealUpdateArgs.safeParse({
			id: "deal_123",
			data: {
				quoteStatus: "APPROVED",
				invoiceStatus: "PAID",
				paymentStatus: "PARTIAL",
				calendarStatus: "SKIPPED",
			},
		});

		expect(parsed.success).toBe(false);
	});
});
