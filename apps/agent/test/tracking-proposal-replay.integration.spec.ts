import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { runInboundCandidateReplay } from "../agent/lib/inbound-replay";

const suffix = (process.env.TEST_RUN_ID ?? "tracking-proposal").replace(
	/[^a-zA-Z0-9]/g,
	"",
);
const formId = `zzzz-${suffix}-form`;
const cursor = `zzzz-${suffix}-a`;
const host = `proposal-${suffix}.test`;
const email = `dana-${suffix}@external.test`.toLowerCase();
const visitorId = `visitor${suffix}`.slice(0, 64);

async function clean() {
	const submission = await db.formSubmission.findUnique({
		where: { id: formId },
		select: { candidateId: true, receiptId: true },
	});

	await db.formSubmission.deleteMany({ where: { id: formId } });
	await db.trackedEvent.deleteMany({ where: { visitorId } });
	if (submission?.candidateId) {
		await db.contactCandidateObservation.deleteMany({
			where: { candidateId: submission.candidateId },
		});
		await db.contactCandidate.deleteMany({
			where: { id: submission.candidateId },
		});
	}
}

beforeAll(async () => {
	await clean();
	await db.formSubmission.create({
		data: {
			id: formId,
			visitorId,
			host,
			path: "/pricing",
			email,
			fields: {
				name: "Dana Reed",
				company: "Acme",
				email,
				marketing_consent: "false",
			},
			firstTouch: {
				source: "Google",
				medium: "cpc",
				landing: "/pricing",
			},
			lastTouch: {
				source: "Direct",
				medium: "direct",
				landing: "/pricing",
			},
			consentEvidence: {
				verified: false,
				lawfulBasis: null,
				signals: { marketing_consent: "false" },
			},
			dedupeKey: `tracking-proposal-${suffix}`,
			reviewQueuedAt: new Date(),
		},
	});
	await db.trackedEvent.create({
		data: {
			visitorId,
			type: "page_view",
			host,
			path: "/pricing",
			occurredAt: new Date(),
		},
	});
});

afterAll(clean);

describe("tracking form proposal replay", () => {
	it("links raw evidence to one review-only candidate without a contact", async () => {
		const first = await runInboundCandidateReplay(db, {
			formSubmissionId: cursor,
			websiteDone: true,
			emailDone: true,
		});
		const second = await runInboundCandidateReplay(db, {
			formSubmissionId: cursor,
			websiteDone: true,
			emailDone: true,
		});

		const stored = await db.formSubmission.findUniqueOrThrow({
			where: { id: formId },
			select: {
				visitorId: true,
				contactId: true,
				candidateId: true,
				receiptId: true,
				fields: true,
				firstTouch: true,
				lastTouch: true,
				consentEvidence: true,
			},
		});
		const candidate = await db.contactCandidate.findUniqueOrThrow({
			where: { id: stored.candidateId ?? "missing" },
			select: {
				canonicalEmail: true,
				status: true,
				permissionState: true,
				proposedContactId: true,
				_count: { select: { observations: true } },
			},
		});
		const receipt = await db.inboundSourceReceipt.findUniqueOrThrow({
			where: { id: stored.receiptId ?? "missing" },
			select: {
				connector: true,
				provider: true,
				sourceObjectId: true,
				sourceDigest: true,
				sourceUrl: true,
				redactedMetadata: true,
			},
		});

		expect(first.candidates).toBe(1);
		expect(second.candidates).toBe(0);
		expect(stored.visitorId).toBe(visitorId);
		expect(stored.contactId).toBeNull();
		expect(stored.candidateId).toBeTruthy();
		expect(stored.receiptId).toBeTruthy();
		expect(JSON.stringify(stored.fields)).toContain("marketing_consent");
		expect(JSON.stringify(stored.firstTouch)).toContain("Google");
		expect(JSON.stringify(stored.lastTouch)).toContain("Direct");
		expect(JSON.stringify(stored.consentEvidence)).toContain(
			'"verified":false',
		);
		expect(candidate).toEqual({
			canonicalEmail: email,
			status: "PENDING",
			permissionState: "REVIEW_REQUIRED",
			proposedContactId: null,
			_count: { observations: 1 },
		});
		expect(receipt.connector).toBe("tracking");
		expect(receipt.provider).toBe("first-party-collector");
		expect(receipt.sourceObjectId).toBe(formId);
		expect(receipt.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
		expect(receipt.sourceUrl).toBe(`https://${host}/pricing`);
		expect(JSON.stringify(receipt.redactedMetadata)).not.toContain(email);
		expect(await db.contact.count({ where: { email } })).toBe(0);
	});
});
