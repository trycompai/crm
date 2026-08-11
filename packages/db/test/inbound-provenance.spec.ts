import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Db } from "../src/client";
import {
	contactCandidateIdentityKey,
	contactCandidateObservationKey,
	inboundSourceIdentityKey,
	normalizeInboundSourceIdentity,
	provenanceValueDigest,
} from "../src/inbound/provenance";

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

function source(accountId: string, objectId: string) {
	return {
		connector: " Mailbox ",
		provider: " Gmail ",
		accountId,
		sourceObjectType: " message ",
		sourceObjectId: objectId,
	};
}

function receiptData(accountId: string, objectId: string) {
	return {
		...normalizeInboundSourceIdentity(source(accountId, objectId)),
		sourceDigest: provenanceValueDigest(`${accountId}:${objectId}`),
		redactedMetadata: { fixture: true },
	};
}

async function expectRejected(
	operation: () => PromiseLike<unknown>,
): Promise<void> {
	let rejected = false;
	try {
		await operation();
	} catch {
		rejected = true;
	}
	expect(rejected).toBe(true);
}

describe("inbound provenance pure helpers", () => {
	it("normalizes source identity without changing object identity", () => {
		expect(
			normalizeInboundSourceIdentity(source("account-1", "Message-1")),
		).toEqual({
			connector: "mailbox",
			provider: "gmail",
			accountId: "account-1",
			sourceObjectType: "message",
			sourceObjectId: "Message-1",
		});
	});

	it("keeps account scope in receipt identity", () => {
		expect(inboundSourceIdentityKey(source("account-1", "Message-1"))).not.toBe(
			inboundSourceIdentityKey(source("account-2", "Message-1")),
		);
	});

	it("collapses canonical email across connectors", () => {
		expect(
			contactCandidateIdentityKey({ canonicalEmail: " Person@Example.com " }),
		).toBe(
			contactCandidateIdentityKey({ canonicalEmail: "person@example.com" }),
		);
	});

	it("requires a business identity when email is absent", () => {
		expect(() => contactCandidateIdentityKey({})).toThrow();
		expect(
			contactCandidateIdentityKey({
				canonicalBusinessName: "Example Business",
				canonicalDomain: "example.com",
			}),
		).toBe(
			contactCandidateIdentityKey({
				canonicalBusinessName: " example business ",
				canonicalDomain: "EXAMPLE.COM",
			}),
		);
	});

	it("makes observations deterministic and source-scoped", () => {
		const input = {
			candidateIdentity: { canonicalEmail: "person@example.com" },
			source: source("account-1", "Message-1"),
			observedEmail: "Person@example.com",
			observedName: "Person Example",
			evidenceClass: "header",
		};
		expect(contactCandidateObservationKey(input)).toBe(
			contactCandidateObservationKey(input),
		);
		expect(contactCandidateObservationKey(input)).not.toBe(
			contactCandidateObservationKey({
				...input,
				source: source("account-2", "Message-1"),
			}),
		);
	});
});

databaseDescribe("inbound provenance database contracts", () => {
	let db: Db;
	const suffix = randomUUID();
	const userId = `provenance-user-${suffix}`;

	beforeAll(async () => {
		db = (await import("../src/client")).db;
		await db.user.create({
			data: {
				id: userId,
				name: "Provenance Test Reviewer",
				email: `${userId}@example.test`,
			},
		});
	});

	afterAll(async () => {
		await db.$disconnect();
	});

	it("collapses concurrent candidate, receipt, and observation replay", async () => {
		const accountId = `account-${suffix}`;
		const objectId = `message-${suffix}`;
		const data = receiptData(accountId, objectId);
		const receipts = await Promise.allSettled([
			db.inboundSourceReceipt.create({ data }),
			db.inboundSourceReceipt.create({ data }),
		]);
		expect(
			receipts.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);

		const receipt = await db.inboundSourceReceipt.findUniqueOrThrow({
			where: {
				connector_provider_accountId_sourceObjectType_sourceObjectId: {
					connector: "mailbox",
					provider: "gmail",
					accountId,
					sourceObjectType: "message",
					sourceObjectId: objectId,
				},
			},
		});
		const identityKey = contactCandidateIdentityKey({
			canonicalEmail: `${suffix}@example.test`,
		});
		const candidates = await Promise.allSettled([
			db.contactCandidate.create({ data: { identityKey } }),
			db.contactCandidate.create({ data: { identityKey } }),
		]);
		expect(
			candidates.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);

		const candidate = await db.contactCandidate.findUniqueOrThrow({
			where: { identityKey },
		});
		const observationKey = contactCandidateObservationKey({
			candidateIdentity: { canonicalEmail: `${suffix}@example.test` },
			source: source(accountId, objectId),
			observedEmail: `${suffix}@example.test`,
			evidenceClass: "header",
		});
		const observations = await Promise.allSettled([
			db.contactCandidateObservation.create({
				data: {
					candidateId: candidate.id,
					receiptId: receipt.id,
					observationKey,
					evidenceClass: "header",
				},
			}),
			db.contactCandidateObservation.create({
				data: {
					candidateId: candidate.id,
					receiptId: receipt.id,
					observationKey,
					evidenceClass: "header",
				},
			}),
		]);
		expect(
			observations.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
	});

	it("keeps source identity scoped by connector and account", async () => {
		const objectId = `scoped-${suffix}`;
		await db.inboundSourceReceipt.create({
			data: receiptData(`scope-a-${suffix}`, objectId),
		});
		await db.inboundSourceReceipt.create({
			data: {
				...receiptData(`scope-b-${suffix}`, objectId),
				connector: "calendar",
			},
		});
		await expectRejected(() =>
			db.inboundSourceReceipt.create({
				data: receiptData(`scope-a-${suffix}`, objectId),
			}),
		);
	});

	it("defaults candidates to pending and non-sendable review", async () => {
		const candidate = await db.contactCandidate.create({
			data: { identityKey: `default-${suffix}` },
		});
		expect(candidate.status).toBe("PENDING");
		expect(candidate.permissionState).toBe("REVIEW_REQUIRED");
	});

	it("requires receipts and records human provenance decisions", async () => {
		await expectRejected(() =>
			db.entityFieldProvenance.create({
				data: {
					subjectType: "CONTACT",
					subjectId: `missing-${suffix}`,
					fieldName: "title",
					valueDigest: "missing",
					receiptId: `missing-${suffix}`,
					method: "human",
				},
			}),
		);

		const receipt = await db.inboundSourceReceipt.create({
			data: receiptData(`decision-${suffix}`, `decision-${suffix}`),
		});
		await expectRejected(() =>
			db.entityFieldProvenance.create({
				data: {
					subjectType: "CONTACT",
					subjectId: `contact-${suffix}`,
					fieldName: "title",
					valueDigest: "rejected-without-reviewer",
					receiptId: receipt.id,
					method: "agent",
					status: "REJECTED",
				},
			}),
		);

		const superseded = await db.entityFieldProvenance.create({
			data: {
				subjectType: "CONTACT",
				subjectId: `contact-${suffix}`,
				fieldName: "title",
				valueDigest: "human-value",
				receiptId: receipt.id,
				method: "human-edit",
				status: "SUPERSEDED",
				decidedById: userId,
				decidedAt: new Date(),
			},
		});
		expect(superseded.status).toBe("SUPERSEDED");

		const rejectedLink = await db.entityLinkProvenance.create({
			data: {
				sourceType: "CONTACT",
				sourceId: `contact-${suffix}`,
				relationship: "works_at",
				targetType: "COMPANY",
				targetId: `company-${suffix}`,
				receiptId: receipt.id,
				method: "human-review",
				status: "REJECTED",
				decidedById: userId,
				decidedAt: new Date(),
			},
		});
		expect(rejectedLink.status).toBe("REJECTED");
	});

	it("allows one active quarantine and preserves resolved history", async () => {
		const first = await db.recordQuarantine.create({
			data: {
				subjectType: "CONTACT",
				subjectId: `quarantine-${suffix}`,
				reason: "unsupported-title",
			},
		});
		await expectRejected(() =>
			db.recordQuarantine.create({
				data: {
					subjectType: "CONTACT",
					subjectId: `quarantine-${suffix}`,
					reason: "unsupported-title",
				},
			}),
		);

		await db.recordQuarantine.update({
			where: { id: first.id },
			data: {
				status: "RESOLVED",
				reviewedById: userId,
				reviewedAt: new Date(),
				resolvedAt: new Date(),
			},
		});
		const replacement = await db.recordQuarantine.create({
			data: {
				subjectType: "CONTACT",
				subjectId: `quarantine-${suffix}`,
				reason: "unsupported-title",
			},
		});
		expect(replacement.status).toBe("ACTIVE");
		expect(
			await db.recordQuarantine.count({
				where: { subjectId: `quarantine-${suffix}` },
			}),
		).toBe(2);
	});

	it("preserves legacy exclusion rows with nullable review evidence", async () => {
		const legacy = await db.granolaNoteExclusion.create({
			data: { externalId: `legacy-${suffix}` },
		});
		expect(legacy.sourceDigest).toBeNull();
		expect(legacy.reviewedById).toBeNull();

		const reviewed = await db.granolaNoteExclusion.create({
			data: {
				externalId: `reviewed-${suffix}`,
				reason: "personal-note",
				sourceDigest: "digest",
				evidence: { decision: "manual" },
				reviewedById: userId,
				reviewedAt: new Date(),
			},
		});
		expect(reviewed.reviewedById).toBe(userId);
	});

	it("protects receipts from update and delete", async () => {
		const receipt = await db.inboundSourceReceipt.create({
			data: receiptData(`immutable-${suffix}`, `immutable-${suffix}`),
		});
		await expectRejected(() =>
			db.inboundSourceReceipt.update({
				where: { id: receipt.id },
				data: { sourceDigest: "changed" },
			}),
		);
		await expectRejected(() =>
			db.inboundSourceReceipt.delete({ where: { id: receipt.id } }),
		);
	});
});
