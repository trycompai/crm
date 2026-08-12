import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { previewInboundCanonicalIdentityKey } from "@crm/db/inbound/provenance";
import { runInboundCandidateReplay } from "../agent/lib/inbound-replay";
import {
	importWebsiteLeads,
	type WebsiteLead,
} from "../agent/lib/website-intake";

const suffix = crypto.randomUUID().replaceAll("-", "");
const prefix = `zzzz-tracking-website-${suffix}`;
const websiteExternalId = `${prefix}-website`;
const formId = `${prefix}-form`;
const email = `dana-${suffix}@external.test`;
const host = `tracking-${suffix}.test`;
const formCursor = `${prefix}-e`;
const websiteCursor = `${prefix}-v`;
const replayReason =
	"Replay persisted website enquiries into reviewable candidate evidence";
let effectsBefore = { activities: 0, drafts: 0, sendTasks: 0 };

function websiteLead(overrides: Partial<WebsiteLead> = {}): WebsiteLead {
	return {
		id: websiteExternalId,
		created_at: "2026-08-12T12:00:00.000Z",
		name: "Dana Reed",
		email,
		company: "Acme Landscaping",
		country: "GB",
		biggest_pain: "Scheduling work",
		source: "request_access",
		source_path: "/request-access",
		utm: { source: "search", campaign: "launch" },
		qa_tag: null,
		notes: "Request access",
		...overrides,
	};
}

async function replay() {
	return runInboundCandidateReplay(db, {
		formSubmissionId: formCursor,
		websiteExternalId: websiteCursor,
		emailDone: true,
	});
}

beforeAll(async () => {
	const [activities, drafts, sendTasks] = await Promise.all([
		db.activity.count(),
		db.emailDraft.count(),
		db.agentTask.count({ where: { kind: "email-draft-send" } }),
	]);
	effectsBefore = { activities, drafts, sendTasks };
	await importWebsiteLeads([websiteLead()]);
	await db.formSubmission.create({
		data: {
			id: formId,
			visitorId: `visitor-${suffix}`,
			host,
			path: "/request-access",
			email,
			fields: { name: "Dana Reed", company: "Acme Landscaping", email },
			firstTouch: { source: "Google", medium: "cpc", landing: "/pricing" },
			lastTouch: { source: "Direct", medium: "direct", landing: "/contact" },
			consentEvidence: {
				verified: false,
				lawfulBasis: null,
				signals: { marketing_consent: "false" },
			},
			dedupeKey: `${prefix}-dedupe`,
			reviewQueuedAt: new Date(),
		},
	});
});

afterAll(async () => {
	const sources = await db.inboundSourceReceipt.findMany({
		where: { sourceObjectId: { in: [websiteExternalId, formId] } },
		select: { id: true },
	});
	const observations = await db.contactCandidateObservation.findMany({
		where: { receiptId: { in: sources.map((source) => source.id) } },
		select: { candidateId: true },
	});
	await Promise.all([
		db.formSubmission.deleteMany({ where: { id: formId } }),
		db.websiteEnquiry.deleteMany({ where: { externalId: websiteExternalId } }),
	]);
	await db.contactCandidateObservation.deleteMany({
		where: { receiptId: { in: sources.map((source) => source.id) } },
	});
	await db.contactCandidate.deleteMany({
		where: {
			id: { in: observations.map((observation) => observation.candidateId) },
		},
	});
	await db.agentTask.deleteMany({ where: { reason: replayReason } });
});

describe("tracking and website candidate convergence", () => {
	it("keeps each source and links both observations to one review-only candidate", async () => {
		const first = await replay();
		const repeated = await replay();
		const concurrent = await Promise.all([replay(), replay()]);

		const [website, form] = await Promise.all([
			db.websiteEnquiry.findUniqueOrThrow({
				where: { externalId: websiteExternalId },
				select: {
					candidateId: true,
					receiptId: true,
					companyId: true,
					contactId: true,
				},
			}),
			db.formSubmission.findUniqueOrThrow({
				where: { id: formId },
				select: { candidateId: true, receiptId: true, contactId: true },
			}),
		]);
		const candidate = await db.contactCandidate.findUniqueOrThrow({
			where: { id: website.candidateId ?? "missing" },
			select: {
				canonicalIdentityKey: true,
				status: true,
				permissionState: true,
				proposedContactId: true,
				proposedCompanyId: true,
			},
		});
		const receipts = await db.inboundSourceReceipt.findMany({
			where: { id: { in: [website.receiptId ?? "", form.receiptId ?? ""] } },
			select: { id: true, connector: true, sourceObjectId: true },
		});
		const observations = await db.contactCandidateObservation.findMany({
			where: { candidateId: website.candidateId ?? "missing" },
			select: { receiptId: true, evidenceClass: true },
		});

		expect(first.candidates).toBe(1);
		expect(repeated.candidates).toBe(0);
		expect(concurrent.every((result) => result.candidates === 0)).toBe(true);
		expect(website.candidateId).toBe(form.candidateId);
		expect(website.receiptId).not.toBe(form.receiptId);
		expect(website.companyId).toBeNull();
		expect(website.contactId).toBeNull();
		expect(form.contactId).toBeNull();
		expect(candidate).toEqual({
			canonicalIdentityKey: previewInboundCanonicalIdentityKey({
				canonicalEmail: email,
			}),
			status: "PENDING",
			permissionState: "REVIEW_REQUIRED",
			proposedContactId: null,
			proposedCompanyId: null,
		});
		expect(receipts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					connector: "website",
					sourceObjectId: websiteExternalId,
				}),
				expect.objectContaining({
					connector: "tracking",
					sourceObjectId: formId,
				}),
			]),
		);
		expect(observations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					receiptId: website.receiptId,
					evidenceClass: "website-submission",
				}),
				expect.objectContaining({
					receiptId: form.receiptId,
					evidenceClass: "tracking-form-unverified-permission",
				}),
			]),
		);
		expect(await db.contact.count({ where: { email } })).toBe(0);
		expect(await db.activity.count()).toBe(effectsBefore.activities);
		expect(await db.emailDraft.count()).toBe(effectsBefore.drafts);
		expect(
			await db.agentTask.count({ where: { kind: "email-draft-send" } }),
		).toBe(effectsBefore.sendTasks);
	});

	it("versions a changed website source without creating another candidate", async () => {
		const updated = await importWebsiteLeads([
			websiteLead({ company: "Acme Landscaping Updated" }),
		]);
		const reset = await db.websiteEnquiry.findUniqueOrThrow({
			where: { externalId: websiteExternalId },
			select: { candidateId: true, receiptId: true },
		});
		const replayed = await replay();
		const website = await db.websiteEnquiry.findUniqueOrThrow({
			where: { externalId: websiteExternalId },
			select: { candidateId: true, receiptId: true },
		});
		const [candidates, receipts, observations] = await Promise.all([
			db.contactCandidate.count({
				where: {
					canonicalIdentityKey: previewInboundCanonicalIdentityKey({
						canonicalEmail: email,
					}),
				},
			}),
			db.inboundSourceReceipt.count({
				where: { sourceObjectId: websiteExternalId },
			}),
			db.contactCandidateObservation.count({
				where: { candidateId: website.candidateId ?? "missing" },
			}),
		]);

		expect(updated).toMatchObject({
			imported: 0,
			updated: 1,
			duplicates: 0,
		});
		expect(reset).toEqual({ candidateId: null, receiptId: null });
		expect(replayed.candidates).toBe(0);
		expect(website.candidateId).toBeTruthy();
		expect(website.receiptId).toBeTruthy();
		expect(candidates).toBe(1);
		expect(receipts).toBe(2);
		expect(observations).toBe(3);
	});
});
