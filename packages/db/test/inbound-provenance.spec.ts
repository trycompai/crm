import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Db } from "../src/client";
import {
	contactCandidateIdentityKey,
	contactCandidateObservationKey,
	inboundSourceIdentityKey,
	inboundSourceReceiptVersionKey,
	normalizeInboundSourceIdentity,
	provenanceValueDigest,
	sanitizeInboundRedactedMetadata,
} from "../src/inbound/provenance";

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

function source(
	accountId: string,
	objectId: string,
	sourceDigest = provenanceValueDigest(`${accountId}:${objectId}`),
) {
	return {
		connector: " Mailbox ",
		provider: " Gmail ",
		accountId,
		sourceObjectType: " message ",
		sourceObjectId: objectId,
		sourceDigest,
	};
}

function receiptData(
	accountId: string,
	objectId: string,
	sourceDigest = provenanceValueDigest(`${accountId}:${objectId}`),
) {
	return {
		...normalizeInboundSourceIdentity(
			source(accountId, objectId, sourceDigest),
		),
		redactedMetadata: sanitizeInboundRedactedMetadata({ fixture: true }),
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
			sourceDigest: provenanceValueDigest("account-1:Message-1"),
		});
	});

	it("keeps account scope in receipt identity", () => {
		expect(inboundSourceIdentityKey(source("account-1", "Message-1"))).not.toBe(
			inboundSourceIdentityKey(source("account-2", "Message-1")),
		);
		expect(
			inboundSourceReceiptVersionKey(source("account-1", "Message-1")),
		).not.toBe(
			inboundSourceReceiptVersionKey(
				source("account-1", "Message-1", provenanceValueDigest("changed")),
			),
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
		expect(contactCandidateObservationKey(input)).not.toBe(
			contactCandidateObservationKey({
				...input,
				source: source(
					"account-1",
					"Message-1",
					provenanceValueDigest("changed"),
				),
			}),
		);
	});

	it("rejects unsafe metadata recursively and enforces the size limit", () => {
		expect(sanitizeInboundRedactedMetadata({ nested: { safe: true } })).toEqual(
			{
				nested: { safe: true },
			},
		);
		expect(() =>
			sanitizeInboundRedactedMetadata({
				nested: { Authorization: "redacted" },
			}),
		).toThrow();
		expect(() => sanitizeInboundRedactedMetadata([])).toThrow();
		expect(() =>
			sanitizeInboundRedactedMetadata({ detail: "x".repeat(16_500) }),
		).toThrow();
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
				connector_provider_accountId_sourceObjectType_sourceObjectId_sourceDigest:
					{
						connector: "mailbox",
						provider: "gmail",
						accountId,
						sourceObjectType: "message",
						sourceObjectId: objectId,
						sourceDigest: data.sourceDigest,
					},
			},
		});
		const identityKey = contactCandidateIdentityKey({
			canonicalEmail: `${suffix}@example.test`,
		});
		const candidates = await Promise.allSettled([
			db.contactCandidate.create({
				data: { identityKey, canonicalEmail: `${suffix}@example.test` },
			}),
			db.contactCandidate.create({
				data: { identityKey, canonicalEmail: `${suffix}@example.test` },
			}),
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
					sourceDigest: data.sourceDigest,
					observationKey,
					evidenceClass: "header",
				},
			}),
			db.contactCandidateObservation.create({
				data: {
					candidateId: candidate.id,
					receiptId: receipt.id,
					sourceDigest: data.sourceDigest,
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
		const accountId = `scope-a-${suffix}`;
		const firstDigest = provenanceValueDigest(`first-${suffix}`);
		await db.inboundSourceReceipt.create({
			data: receiptData(accountId, objectId, firstDigest),
		});
		await db.inboundSourceReceipt.create({
			data: {
				...receiptData(`scope-b-${suffix}`, objectId),
				connector: "calendar",
			},
		});
		await expectRejected(() =>
			db.inboundSourceReceipt.create({
				data: receiptData(accountId, objectId, firstDigest),
			}),
		);
		const second = await db.inboundSourceReceipt.create({
			data: receiptData(
				accountId,
				objectId,
				provenanceValueDigest(`second-${suffix}`),
			),
		});
		expect(second.sourceDigest).not.toBe(firstDigest);
	});

	it("keeps observations distinct for immutable receipt versions", async () => {
		const accountId = `version-${suffix}`;
		const objectId = `message-${suffix}`;
		const firstDigest = provenanceValueDigest(`version-first-${suffix}`);
		const secondDigest = provenanceValueDigest(`version-second-${suffix}`);
		const firstReceipt = await db.inboundSourceReceipt.create({
			data: receiptData(accountId, objectId, firstDigest),
		});
		const secondReceipt = await db.inboundSourceReceipt.create({
			data: receiptData(accountId, objectId, secondDigest),
		});
		const canonicalEmail = `version-${suffix}@example.test`;
		const candidate = await db.contactCandidate.create({
			data: {
				identityKey: contactCandidateIdentityKey({ canonicalEmail }),
				canonicalEmail,
			},
		});
		for (const [receipt, digest] of [
			[firstReceipt, firstDigest],
			[secondReceipt, secondDigest],
		] as const) {
			await db.contactCandidateObservation.create({
				data: {
					candidateId: candidate.id,
					receiptId: receipt.id,
					sourceDigest: digest,
					observationKey: contactCandidateObservationKey({
						candidateIdentity: { canonicalEmail },
						source: source(accountId, objectId, digest),
						observedEmail: canonicalEmail,
						evidenceClass: "header",
					}),
					evidenceClass: "header",
				},
			});
		}
		expect(
			await db.contactCandidateObservation.count({
				where: { candidateId: candidate.id },
			}),
		).toBe(2);
		for (const receipt of [firstReceipt, secondReceipt]) {
			await expectRejected(() =>
				db.inboundSourceReceipt.update({
					where: { id: receipt.id },
					data: {
						sourceDigest: provenanceValueDigest(`mutated-${receipt.id}`),
					},
				}),
			);
			await expectRejected(() =>
				db.inboundSourceReceipt.delete({ where: { id: receipt.id } }),
			);
		}
		await expectRejected(() =>
			db.contactCandidateObservation.create({
				data: {
					candidateId: candidate.id,
					receiptId: firstReceipt.id,
					sourceDigest: secondDigest,
					observationKey: provenanceValueDigest(`mismatched-${suffix}`),
					evidenceClass: "header",
				},
			}),
		);
		await expectRejected(() =>
			db.contactCandidateObservation.create({
				data: {
					candidateId: candidate.id,
					receiptId: firstReceipt.id,
					sourceDigest: firstDigest,
					observationKey: "not-a-digest",
					evidenceClass: "header",
				},
			}),
		);
	});

	it("defaults candidates to pending and non-sendable review", async () => {
		const canonicalEmail = `default-${suffix}@example.test`;
		const candidate = await db.contactCandidate.create({
			data: {
				identityKey: contactCandidateIdentityKey({ canonicalEmail }),
				canonicalEmail,
			},
		});
		expect(candidate.status).toBe("PENDING");
		expect(candidate.permissionState).toBe("REVIEW_REQUIRED");
	});

	it("rejects arbitrary candidate keys and unsafe decision states", async () => {
		await expectRejected(() =>
			db.contactCandidate.create({
				data: {
					identityKey: "a".repeat(64),
				},
			}),
		);
		await expectRejected(() =>
			db.contactCandidate.create({
				data: {
					identityKey: "not-a-digest",
					canonicalEmail: `invalid-${suffix}@example.test`,
				},
			}),
		);
		await expectRejected(() =>
			db.contactCandidate.create({
				data: {
					identityKey: contactCandidateIdentityKey({
						canonicalEmail: `accepted-${suffix}@example.test`,
					}),
					canonicalEmail: `accepted-${suffix}@example.test`,
					status: "ACCEPTED",
				},
			}),
		);
		await expectRejected(() =>
			db.contactCandidate.create({
				data: {
					identityKey: contactCandidateIdentityKey({
						canonicalEmail: `rejected-${suffix}@example.test`,
					}),
					canonicalEmail: `rejected-${suffix}@example.test`,
					status: "REJECTED",
				},
			}),
		);
		const accepted = await db.contactCandidate.create({
			data: {
				identityKey: contactCandidateIdentityKey({
					canonicalEmail: `accepted-valid-${suffix}@example.test`,
				}),
				canonicalEmail: `accepted-valid-${suffix}@example.test`,
				status: "ACCEPTED",
				decisionById: userId,
				decisionReason: "matched to existing CRM record",
				decidedAt: new Date(),
			},
		});
		expect(accepted.status).toBe("ACCEPTED");
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
					subjectId: `shape-${suffix}`,
					fieldName: "title",
					valueDigest: "not-a-digest",
					receiptId: receipt.id,
					method: "agent",
				},
			}),
		);
		await expectRejected(() =>
			db.entityFieldProvenance.create({
				data: {
					subjectType: "CONTACT",
					subjectId: `shape-${suffix}`,
					fieldName: "title",
					valueDigest: provenanceValueDigest("confidence"),
					receiptId: receipt.id,
					method: "agent",
					confidence: 1.1,
				},
			}),
		);
		await expectRejected(() =>
			db.entityFieldProvenance.create({
				data: {
					subjectType: "CONTACT",
					subjectId: `shape-${suffix}`,
					fieldName: "title",
					valueDigest: provenanceValueDigest("freshness"),
					receiptId: receipt.id,
					method: "agent",
					observedAt: new Date("2026-08-11T12:00:00.000Z"),
					freshUntil: new Date("2026-08-11T11:00:00.000Z"),
				},
			}),
		);
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
				valueDigest: provenanceValueDigest("human-value"),
				receiptId: receipt.id,
				method: "human-edit",
				status: "SUPERSEDED",
				decidedById: userId,
				decidedAt: new Date(),
			},
		});
		expect(superseded.status).toBe("SUPERSEDED");

		const applied = await db.entityFieldProvenance.create({
			data: {
				subjectType: "CONTACT",
				subjectId: `applied-${suffix}`,
				fieldName: "title",
				valueDigest: provenanceValueDigest("applied-one"),
				receiptId: receipt.id,
				method: "agent",
				status: "APPLIED",
			},
		});
		await expectRejected(() =>
			db.entityFieldProvenance.create({
				data: {
					subjectType: "CONTACT",
					subjectId: `applied-${suffix}`,
					fieldName: "title",
					valueDigest: provenanceValueDigest("applied-two"),
					receiptId: receipt.id,
					method: "agent",
					status: "APPLIED",
				},
			}),
		);
		await db.entityFieldProvenance.update({
			where: { id: applied.id },
			data: {
				status: "SUPERSEDED",
				decidedById: userId,
				decidedAt: new Date(),
			},
		});
		const replacementField = await db.entityFieldProvenance.create({
			data: {
				subjectType: "CONTACT",
				subjectId: `applied-${suffix}`,
				fieldName: "title",
				valueDigest: provenanceValueDigest("applied-two"),
				receiptId: receipt.id,
				method: "agent",
				status: "APPLIED",
			},
		});
		expect(replacementField.status).toBe("APPLIED");

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

		const appliedLink = await db.entityLinkProvenance.create({
			data: {
				sourceType: "CONTACT",
				sourceId: `linked-${suffix}`,
				relationship: "works_at",
				targetType: "COMPANY",
				targetId: `company-a-${suffix}`,
				receiptId: receipt.id,
				method: "agent",
				status: "APPLIED",
			},
		});
		await expectRejected(() =>
			db.entityLinkProvenance.create({
				data: {
					sourceType: "CONTACT",
					sourceId: `linked-${suffix}`,
					relationship: "works_at",
					targetType: "COMPANY",
					targetId: `company-b-${suffix}`,
					receiptId: receipt.id,
					method: "agent",
					status: "APPLIED",
				},
			}),
		);
		await db.entityLinkProvenance.update({
			where: { id: appliedLink.id },
			data: {
				status: "SUPERSEDED",
				decidedById: userId,
				decidedAt: new Date(),
			},
		});
		const replacementLink = await db.entityLinkProvenance.create({
			data: {
				sourceType: "CONTACT",
				sourceId: `linked-${suffix}`,
				relationship: "works_at",
				targetType: "COMPANY",
				targetId: `company-b-${suffix}`,
				receiptId: receipt.id,
				method: "agent",
				status: "APPLIED",
			},
		});
		expect(replacementLink.status).toBe("APPLIED");
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

	it("rejects unsafe receipt metadata and malformed source digests", async () => {
		await expectRejected(() =>
			db.inboundSourceReceipt.create({
				data: {
					...receiptData(`metadata-${suffix}`, `bad-digest-${suffix}`),
					sourceDigest: "not-a-digest",
				},
			}),
		);
		await expectRejected(() =>
			db.inboundSourceReceipt.create({
				data: {
					...receiptData(`metadata-${suffix}`, `bad-object-${suffix}`),
					redactedMetadata: "payload",
				},
			}),
		);
		await expectRejected(() =>
			db.inboundSourceReceipt.create({
				data: {
					...receiptData(`metadata-${suffix}`, `bad-key-${suffix}`),
					redactedMetadata: { body: "payload" },
				},
			}),
		);
		await expectRejected(() =>
			db.inboundSourceReceipt.create({
				data: {
					...receiptData(`metadata-${suffix}`, `case-key-${suffix}`),
					redactedMetadata: { Authorization: "payload" },
				},
			}),
		);
		await expectRejected(() =>
			db.inboundSourceReceipt.create({
				data: {
					...receiptData(`metadata-${suffix}`, `too-large-${suffix}`),
					redactedMetadata: { detail: "x".repeat(16_500) },
				},
			}),
		);
	});
});
