import { describe, expect, it } from "bun:test";
import {
	inboundLead,
	inboundSuppression,
} from "../src/prospecting/prospecting.contracts";

describe("product integration contracts", () => {
	it("accepts a strict consent-bearing lead event", () => {
		const result = inboundLead.safeParse({
			eventId: "beam-event-123",
			product: "BEAMDEPLOY",
			occurredAt: "2026-08-03T12:00:00.000Z",
			lead: {
				kind: "INDIVIDUAL",
				email: "person@example.test",
				consent: {
					status: "granted",
					capturedAt: "2026-08-03T12:00:00.000Z",
					policyVersion: "v1",
					source: "waitlist",
				},
			},
		});
		expect(result.success).toBe(true);
	});

	it("rejects unknown fields and malformed suppression events", () => {
		expect(
			inboundLead.safeParse({
				eventId: "beam-event-123",
				product: "BEAMDEPLOY",
				occurredAt: "2026-08-03T12:00:00.000Z",
				lead: {},
				unexpected: true,
			}).success,
		).toBe(false);
		expect(
			inboundSuppression.safeParse({
				eventId: "remove-123",
				product: "ARQUIVO_FATURAS",
				occurredAt: "not-a-date",
				email: "bad",
				reason: "removed",
			}).success,
		).toBe(false);
	});
});
