import { describe, expect, it } from "bun:test";
import {
	claapWebhookInput,
	clayWebhookInput,
} from "../src/integrations/integration.contracts";

describe("Clay integration payload", () => {
	it("normalizes emails and currency", () => {
		const parsed = clayWebhookInput.parse({
			eventId: "row-1",
			ownerEmail: "Owner@Acme.com",
			company: { name: "Acme", domain: "acme.com" },
			contact: { firstName: "Jane", email: "Jane@Customer.com" },
			opportunity: { name: "Acme expansion", currency: "eur" },
		});

		expect(parsed.ownerEmail).toBe("owner@acme.com");
		expect(parsed.contact.email).toBe("jane@customer.com");
		expect(parsed.opportunity?.currency).toBe("EUR");
	});

	it("requires explicit company and contact identity", () => {
		const parsed = clayWebhookInput.safeParse({
			eventId: "row-1",
			ownerEmail: "owner@acme.com",
		});

		expect(parsed.success).toBe(false);
	});
});

describe("Claap integration payload", () => {
	const event = {
		type: "recording_added",
		recording: {
			id: "recording-1",
			title: "Discovery",
			createdAt: "2026-08-04T01:00:00.000Z",
			recorder: { email: "Rep@Acme.com" },
			meeting: {
				participants: [{ email: "Buyer@Customer.com" }],
			},
		},
	};

	it("accepts the documented event envelope", () => {
		const parsed = claapWebhookInput.parse({ eventId: "delivery-1", event });

		expect(parsed.eventId).toBe("delivery-1");
		expect(parsed.event.recording.recorder.email).toBe("rep@acme.com");
		expect(parsed.event.recording.meeting?.participants[0]?.email).toBe(
			"buyer@customer.com",
		);
	});

	it("derives a stable id for the unwrapped event shape", () => {
		const parsed = claapWebhookInput.parse(event);

		expect(parsed.eventId).toBe("recording_added:recording-1");
	});
});
