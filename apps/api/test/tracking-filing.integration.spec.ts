import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { TrackingFilingService } from "../src/tracking/tracking-filing.service";

const suffix = process.env.TEST_RUN_ID ?? "tracking-proposal-spec";
const host = `forms-${suffix}.test`;
const email = `person-${suffix}@example.test`;
const queued: string[] = [];

const agent = {
	trackingSubmissionReceived: async (submissionId: string) => {
		queued.push(submissionId);
	},
} as unknown as AgentTriggerService;

const filing = new TrackingFilingService(db, agent);

async function submission(address: string | null) {
	return db.formSubmission.create({
		data: {
			host,
			path: "/contact",
			email: address,
			fields: { name: "Dana Reed", email: address ?? "" },
			dedupeKey: `${suffix}-${crypto.randomUUID()}`,
		},
		select: { id: true },
	});
}

beforeAll(async () => {
	await db.formSubmission.deleteMany({ where: { host } });
	await db.contact.deleteMany({ where: { email } });
});

afterAll(async () => {
	await db.formSubmission.deleteMany({ where: { host } });
	await db.contact.deleteMany({ where: { email } });
});

describe("tracking form identity filing", () => {
	it("queues review without creating or trusting a contact", async () => {
		const row = await submission(email);

		const outcome = await filing.file({
			id: row.id,
			email,
			host,
			visitorId: `visitor-${suffix}`,
			name: "Dana Reed",
		});

		const stored = await db.formSubmission.findUniqueOrThrow({
			where: { id: row.id },
			select: {
				contactId: true,
				filedAt: true,
				reviewQueuedAt: true,
				skipReason: true,
			},
		});

		expect(outcome).toEqual({
			filed: false,
			reason: "Queued for identity review",
		});
		expect(stored.contactId).toBeNull();
		expect(stored.filedAt).toBeNull();
		expect(stored.reviewQueuedAt).not.toBeNull();
		expect(stored.skipReason).toBeNull();
		expect(await db.contact.count({ where: { email } })).toBe(0);
		expect(queued).toEqual([row.id]);
	});

	it("queues one review when the same submission is delivered twice", async () => {
		queued.length = 0;
		const row = await submission(`repeat-${email}`);
		const input = {
			id: row.id,
			email: `repeat-${email}`,
			host,
			visitorId: `visitor-repeat-${suffix}`,
			name: "Dana Reed",
		};

		const outcomes = await Promise.all([
			filing.file(input),
			filing.file(input),
		]);

		expect(queued).toEqual([row.id]);
		expect(outcomes.map((outcome) => outcome.reason).sort()).toEqual([
			"Already queued for identity review",
			"Queued for identity review",
		]);
	});

	it("stores a missing-email reason without queuing identity work", async () => {
		queued.length = 0;
		const row = await submission(null);

		const outcome = await filing.file({
			id: row.id,
			email: null,
			host,
			visitorId: null,
			name: null,
		});

		const stored = await db.formSubmission.findUniqueOrThrow({
			where: { id: row.id },
			select: { reviewQueuedAt: true, skipReason: true },
		});

		expect(outcome).toEqual({ filed: false, reason: "No email address" });
		expect(stored.reviewQueuedAt).toBeNull();
		expect(stored.skipReason).toBe("No email address");
		expect(queued).toHaveLength(0);
	});
});
