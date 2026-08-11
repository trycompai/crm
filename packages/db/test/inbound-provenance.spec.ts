import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Db } from "../src/client";
import {
	canonicalizeInboundText,
	inboundSourceIdentityKey,
	inboundSourceReceiptVersionKey,
	normalizeInboundSourceIdentity,
	previewInboundCanonicalIdentityKey,
	previewInboundObservationIdentityKey,
	provenanceValueDigest,
	retainedContactCandidateHash,
	retainedContactCandidateObservationHash,
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
		redactedMetadata: sanitizeInboundRedactedMetadata({
			provider: "gmail",
			resourceType: "message",
			resourceId: objectId,
		}),
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

	it("normalizes canonical email in the retained candidate hash", () => {
		expect(
			retainedContactCandidateHash({ canonicalEmail: " Person@Example.com " }),
		).toBe(
			retainedContactCandidateHash({ canonicalEmail: "person@example.com" }),
		);
	});

	it("uses the shared NFKC canonicalization for persisted identity shapes", () => {
		expect(canonicalizeInboundText(" Ｆｏｏ＠Ｅｘａｍｐｌｅ．ｔｅｓｔ ")).toBe(
			"foo@example.test",
		);
		expect(
			previewInboundCanonicalIdentityKey({
				canonicalEmail: "Ｆｏｏ＠Ｅｘａｍｐｌｅ．ｔｅｓｔ",
			}),
		).toBe(
			previewInboundCanonicalIdentityKey({
				canonicalEmail: "foo@example.test",
			}),
		);
	});

	it("requires a business identity for the retained candidate hash", () => {
		expect(() => retainedContactCandidateHash({})).toThrow();
		expect(
			retainedContactCandidateHash({
				canonicalBusinessName: "Example Business",
				canonicalDomain: "example.com",
			}),
		).toBe(
			retainedContactCandidateHash({
				canonicalBusinessName: " example business ",
				canonicalDomain: "EXAMPLE.COM",
			}),
		);
	});

	it("makes the retained observation hash deterministic and source-scoped", () => {
		const input = {
			candidateIdentity: { canonicalEmail: "person@example.com" },
			source: source("account-1", "Message-1"),
			observedEmail: "Person@example.com",
			observedName: "Person Example",
			evidenceClass: "header",
		};
		expect(retainedContactCandidateObservationHash(input)).toBe(
			retainedContactCandidateObservationHash(input),
		);
		expect(retainedContactCandidateObservationHash(input)).not.toBe(
			retainedContactCandidateObservationHash({
				...input,
				source: source("account-2", "Message-1"),
			}),
		);
		expect(retainedContactCandidateObservationHash(input)).not.toBe(
			retainedContactCandidateObservationHash({
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
		expect(
			sanitizeInboundRedactedMetadata({
				provider: "gmail",
				status: "ok",
				attempt: 1,
			}),
		).toEqual({ provider: "gmail", status: "ok", attempt: 1 });
		expect(() =>
			sanitizeInboundRedactedMetadata({ provider: { name: "gmail" } }),
		).toThrow();
		expect(() =>
			sanitizeInboundRedactedMetadata({ status: "Bearer secret" }),
		).toThrow();
		expect(() => sanitizeInboundRedactedMetadata([])).toThrow();
		expect(() =>
			sanitizeInboundRedactedMetadata({ cursor: "x".repeat(513) }),
		).toThrow();
		expect(() =>
			sanitizeInboundRedactedMetadata({ cursor: "x".repeat(16_500) }),
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
		const identityKey = retainedContactCandidateHash({
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

		const candidate = await db.contactCandidate.findFirstOrThrow({
			where: { identityKey },
		});
		const observationKey = retainedContactCandidateObservationHash({
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
					observationIdentityKey: "caller-forged-observation",
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
		const persistedObservation =
			await db.contactCandidateObservation.findFirstOrThrow({
				where: { candidateId: candidate.id },
			});
		expect(persistedObservation.observationIdentityKey).toBe(
			previewInboundObservationIdentityKey({
				candidateId: candidate.id,
				receiptId: receipt.id,
				sourceDigest: data.sourceDigest,
				evidenceClass: "header",
			}),
		);
		await expectRejected(() =>
			db.contactCandidateObservation.create({
				data: {
					candidateId: candidate.id,
					receiptId: receipt.id,
					sourceDigest: data.sourceDigest,
					observationKey: provenanceValueDigest(`wrong-tuple-key-${suffix}`),
					evidenceClass: "header",
				},
			}),
		);
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
				identityKey: retainedContactCandidateHash({ canonicalEmail }),
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
					observationKey: retainedContactCandidateObservationHash({
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
				identityKey: retainedContactCandidateHash({ canonicalEmail }),
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
					identityKey: retainedContactCandidateHash({
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
					identityKey: retainedContactCandidateHash({
						canonicalEmail: `rejected-${suffix}@example.test`,
					}),
					canonicalEmail: `rejected-${suffix}@example.test`,
					status: "REJECTED",
				},
			}),
		);
		await expectRejected(() =>
			db.contactCandidate.create({
				data: {
					identityKey: retainedContactCandidateHash({
						canonicalEmail: `accepted-no-contact-${suffix}@example.test`,
					}),
					canonicalEmail: `accepted-no-contact-${suffix}@example.test`,
					status: "ACCEPTED",
					decisionById: userId,
					decisionReason: "reviewed",
					decidedAt: new Date(),
				},
			}),
		);
		const acceptedContact = await db.contact.create({
			data: {
				id: `accepted-contact-${suffix}`,
				firstName: "Accepted",
				email: `accepted-contact-${suffix}@example.test`,
			},
		});
		const accepted = await db.contactCandidate.create({
			data: {
				identityKey: retainedContactCandidateHash({
					canonicalEmail: `accepted-valid-${suffix}@example.test`,
				}),
				canonicalEmail: `accepted-valid-${suffix}@example.test`,
				status: "ACCEPTED",
				proposedContactId: acceptedContact.id,
				decisionById: userId,
				decisionReason: "matched to existing CRM record",
				decidedAt: new Date(),
			},
		});
		expect(accepted.status).toBe("ACCEPTED");
	});

	it("uses DB canonical identity uniqueness while retaining non-authoritative hashes", async () => {
		const retainedHash = provenanceValueDigest(`retained-hash-${suffix}`);
		const first = await db.contactCandidate.create({
			data: {
				identityKey: retainedHash,
				canonicalEmail: ` Same-one-${suffix}@Example.test `,
				canonicalIdentityKey: "caller-forged",
			},
		});
		expect(first.identityKey).toBe(retainedHash);
		expect(first.canonicalIdentityKey).toBe(
			previewInboundCanonicalIdentityKey({
				canonicalEmail: ` Same-one-${suffix}@Example.test `,
			}),
		);
		const distinct = await db.contactCandidate.create({
			data: {
				identityKey: retainedHash,
				canonicalEmail: `same-two-${suffix}@example.test`,
			},
		});
		expect(distinct.identityKey).toBe(retainedHash);
		await expectRejected(() =>
			db.contactCandidate.create({
				data: {
					identityKey: provenanceValueDigest(`wrong-identity-${suffix}`),
					canonicalEmail: `same-one-${suffix}@example.test`,
				},
			}),
		);
		const unicodeCandidate = await db.contactCandidate.create({
			data: {
				identityKey: provenanceValueDigest(`unicode-${suffix}`),
				canonicalEmail: `ｕｎｉｃｏｄｅ-${suffix}@Ｅｘａｍｐｌｅ．ｔｅｓｔ`,
				canonicalIdentityKey: provenanceValueDigest(`forged-unicode-${suffix}`),
			},
		});
		expect(unicodeCandidate.canonicalIdentityKey).toBe(
			previewInboundCanonicalIdentityKey({
				canonicalEmail: `ｕｎｉｃｏｄｅ-${suffix}@Ｅｘａｍｐｌｅ．ｔｅｓｔ`,
			}),
		);
		await expectRejected(() =>
			db.contactCandidate.create({
				data: {
					identityKey: provenanceValueDigest(`unicode-duplicate-${suffix}`),
					canonicalEmail: `unicode-${suffix}@example.test`,
				},
			}),
		);
		await db.contactCandidate.create({
			data: {
				identityKey: provenanceValueDigest(`name-email-one-${suffix}`),
				canonicalEmail: `name-one-${suffix}@example.test`,
				canonicalName: "Same Person",
				canonicalDomain: "same.example.test",
			},
		});
		await db.contactCandidate.create({
			data: {
				identityKey: provenanceValueDigest(`name-email-two-${suffix}`),
				canonicalEmail: `name-two-${suffix}@example.test`,
				canonicalName: "Same Person",
				canonicalDomain: "same.example.test",
			},
		});
		await db.contactCandidate.create({
			data: {
				identityKey: provenanceValueDigest(`name-fallback-${suffix}`),
				canonicalName: "Fallback Person",
				canonicalDomain: "fallback.example.test",
			},
		});
		await expectRejected(() =>
			db.contactCandidate.create({
				data: {
					identityKey: provenanceValueDigest(
						`name-fallback-duplicate-${suffix}`,
					),
					canonicalName: " fallback person ",
					canonicalDomain: "FALLBACK.EXAMPLE.TEST",
				},
			}),
		);
		await db.contactCandidate.create({
			data: {
				identityKey: provenanceValueDigest(`business-fallback-${suffix}`),
				canonicalBusinessName: "Fallback Business",
				canonicalDomain: "business.example.test",
			},
		});
		await expectRejected(() =>
			db.contactCandidate.create({
				data: {
					identityKey: provenanceValueDigest(
						`business-fallback-duplicate-${suffix}`,
					),
					canonicalBusinessName: " fallback business ",
					canonicalDomain: "BUSINESS.EXAMPLE.TEST",
				},
			}),
		);
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
		const proposedField = await db.entityFieldProvenance.create({
			data: {
				subjectType: "CONTACT",
				subjectId: `reviewed-transition-${suffix}`,
				fieldName: "title",
				valueDigest: provenanceValueDigest("reviewed-transition"),
				receiptId: receipt.id,
				method: "agent",
			},
		});
		await expectRejected(() =>
			db.entityFieldProvenance.create({
				data: {
					subjectType: "CONTACT",
					subjectId: `prefilled-${suffix}`,
					fieldName: "title",
					valueDigest: provenanceValueDigest("prefilled"),
					receiptId: receipt.id,
					method: "agent",
					decidedById: userId,
					decidedAt: new Date(),
				},
			}),
		);
		await expectRejected(() =>
			db.entityFieldProvenance.update({
				where: { id: proposedField.id },
				data: { status: "APPLIED" },
			}),
		);
		const transitionDecidedAt = new Date();
		const transitionedField = await db.entityFieldProvenance.update({
			where: { id: proposedField.id },
			data: {
				status: "APPLIED",
				decidedById: userId,
				decidedAt: transitionDecidedAt,
			},
		});
		expect(transitionedField.status).toBe("APPLIED");
		await expectRejected(() =>
			db.entityFieldProvenance.create({
				data: {
					subjectType: "CONTACT",
					subjectId: `applied-${suffix}`,
					fieldName: "title",
					valueDigest: provenanceValueDigest("applied-without-reviewer"),
					receiptId: receipt.id,
					method: "agent",
					status: "APPLIED",
				},
			}),
		);
		const applicationDecidedAt = new Date();

		const applied = await db.entityFieldProvenance.create({
			data: {
				subjectType: "CONTACT",
				subjectId: `applied-${suffix}`,
				fieldName: "title",
				valueDigest: provenanceValueDigest("applied-one"),
				receiptId: receipt.id,
				method: "agent",
				status: "APPLIED",
				decidedById: userId,
				decidedAt: applicationDecidedAt,
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
		await expectRejected(
			() =>
				db.$executeRaw`UPDATE "entityFieldProvenance" SET "valueDigest" = ${provenanceValueDigest("mutated-applied")} WHERE "id" = ${applied.id}`,
		);
		await expectRejected(
			() =>
				db.$executeRaw`UPDATE "entityFieldProvenance" SET "status" = 'APPLIED' WHERE "id" = ${applied.id}`,
		);
		await expectRejected(() =>
			db.entityFieldProvenance.delete({ where: { id: applied.id } }),
		);
		await expectRejected(
			() =>
				db.$executeRaw`UPDATE "entityFieldProvenance" SET "status" = 'SUPERSEDED', "decidedById" = ${userId}, "decidedAt" = ${applicationDecidedAt} WHERE "id" = ${applied.id}`,
		);
		await db.$executeRaw`UPDATE "entityFieldProvenance" SET "status" = 'SUPERSEDED', "decidedById" = ${userId}, "decidedAt" = CURRENT_TIMESTAMP WHERE "id" = ${applied.id}`;
		await expectRejected(
			() =>
				db.$executeRaw`UPDATE "entityFieldProvenance" SET "subjectId" = ${`rewritten-${suffix}`} WHERE "id" = ${applied.id}`,
		);
		await expectRejected(() =>
			db.entityFieldProvenance.delete({ where: { id: applied.id } }),
		);
		const replacementField = await db.entityFieldProvenance.create({
			data: {
				subjectType: "CONTACT",
				subjectId: `applied-${suffix}`,
				fieldName: "title",
				valueDigest: provenanceValueDigest("applied-two"),
				receiptId: receipt.id,
				method: "agent",
				status: "APPLIED",
				decidedById: userId,
				decidedAt: new Date(),
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
		const proposedLink = await db.entityLinkProvenance.create({
			data: {
				sourceType: "CONTACT",
				sourceId: `reviewed-link-${suffix}`,
				relationship: "works_at",
				targetType: "COMPANY",
				targetId: `reviewed-company-${suffix}`,
				receiptId: receipt.id,
				method: "agent",
			},
		});
		await expectRejected(() =>
			db.entityLinkProvenance.create({
				data: {
					sourceType: "CONTACT",
					sourceId: `prefilled-link-${suffix}`,
					relationship: "works_at",
					targetType: "COMPANY",
					targetId: `prefilled-company-${suffix}`,
					receiptId: receipt.id,
					method: "agent",
					decidedById: userId,
					decidedAt: new Date(),
				},
			}),
		);
		await expectRejected(() =>
			db.entityLinkProvenance.update({
				where: { id: proposedLink.id },
				data: { status: "APPLIED" },
			}),
		);
		const linkTransitionDecidedAt = new Date();
		const transitionedLink = await db.entityLinkProvenance.update({
			where: { id: proposedLink.id },
			data: {
				status: "APPLIED",
				decidedById: userId,
				decidedAt: linkTransitionDecidedAt,
			},
		});
		expect(transitionedLink.status).toBe("APPLIED");
		await expectRejected(() =>
			db.entityLinkProvenance.create({
				data: {
					sourceType: "CONTACT",
					sourceId: `applied-link-${suffix}`,
					relationship: "works_at",
					targetType: "COMPANY",
					targetId: `applied-company-${suffix}`,
					receiptId: receipt.id,
					method: "agent",
					status: "APPLIED",
				},
			}),
		);
		const linkApplicationDecidedAt = new Date();

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
				decidedById: userId,
				decidedAt: linkApplicationDecidedAt,
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
		await expectRejected(
			() =>
				db.$executeRaw`UPDATE "entityLinkProvenance" SET "targetId" = ${`mutated-${suffix}`} WHERE "id" = ${appliedLink.id}`,
		);
		await expectRejected(
			() =>
				db.$executeRaw`UPDATE "entityLinkProvenance" SET "status" = 'APPLIED' WHERE "id" = ${appliedLink.id}`,
		);
		await expectRejected(() =>
			db.entityLinkProvenance.delete({ where: { id: appliedLink.id } }),
		);
		await expectRejected(
			() =>
				db.$executeRaw`UPDATE "entityLinkProvenance" SET "status" = 'REJECTED', "decidedById" = ${userId}, "decidedAt" = ${linkApplicationDecidedAt} WHERE "id" = ${appliedLink.id}`,
		);
		await db.$executeRaw`UPDATE "entityLinkProvenance" SET "status" = 'REJECTED', "decidedById" = ${userId}, "decidedAt" = CURRENT_TIMESTAMP WHERE "id" = ${appliedLink.id}`;
		await expectRejected(
			() =>
				db.$executeRaw`UPDATE "entityLinkProvenance" SET "targetId" = ${`rewritten-${suffix}`} WHERE "id" = ${appliedLink.id}`,
		);
		await expectRejected(() =>
			db.entityLinkProvenance.delete({ where: { id: appliedLink.id } }),
		);
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
				decidedById: userId,
				decidedAt: new Date(),
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

	it("rejects blank receipt, observation, and quarantine facts", async () => {
		const blankReceiptFields = [
			{ connector: " " },
			{ provider: " " },
			{ accountId: " " },
			{ sourceObjectType: " " },
			{ sourceObjectId: " " },
		] as const;
		for (const [index, override] of blankReceiptFields.entries()) {
			await expectRejected(() =>
				db.inboundSourceReceipt.create({
					data: {
						...receiptData(
							`blank-${suffix}-${index}`,
							`blank-${suffix}-${index}`,
						),
						...override,
					},
				}),
			);
		}
		const receipt = await db.inboundSourceReceipt.create({
			data: receiptData(`blank-valid-${suffix}`, `blank-valid-${suffix}`),
		});
		const candidate = await db.contactCandidate.create({
			data: {
				identityKey: retainedContactCandidateHash({
					canonicalEmail: `blank-${suffix}@example.test`,
				}),
				canonicalEmail: `blank-${suffix}@example.test`,
			},
		});
		await expectRejected(() =>
			db.contactCandidateObservation.create({
				data: {
					candidateId: candidate.id,
					receiptId: receipt.id,
					sourceDigest: receipt.sourceDigest,
					observationKey: provenanceValueDigest(`blank-observation-${suffix}`),
					evidenceClass: " ",
				},
			}),
		);
		await expectRejected(() =>
			db.recordQuarantine.create({
				data: {
					subjectType: "CONTACT",
					subjectId: `blank-quarantine-${suffix}`,
					reason: " ",
				},
			}),
		);
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

	it("accepts only bounded public HTTPS source locators", async () => {
		const valid = await db.inboundSourceReceipt.create({
			data: {
				...receiptData(`url-valid-${suffix}`, `url-valid-${suffix}`),
				sourceUrl: "https://evidence.example.test/messages/object-1",
			},
		});
		expect(valid.sourceUrl).toBe(
			"https://evidence.example.test/messages/object-1",
		);
		for (const [index, sourceUrl] of [
			"http://evidence.example.test/object",
			"https://user:password@evidence.example.test/object",
			"https://evidence.example.test/object?token=secret",
			"https://evidence.example.test/object#fragment",
			`https://evidence.example.test/${"x".repeat(2050)}`,
		] as const) {
			await expectRejected(() =>
				db.inboundSourceReceipt.create({
					data: {
						...receiptData(
							`url-invalid-${suffix}-${index}`,
							`url-invalid-${suffix}-${index}`,
						),
						sourceUrl,
					},
				}),
			);
		}
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
					...receiptData(`metadata-${suffix}`, `nested-${suffix}`),
					redactedMetadata: { provider: { name: "gmail" } },
				},
			}),
		);
		await expectRejected(() =>
			db.inboundSourceReceipt.create({
				data: {
					...receiptData(`metadata-${suffix}`, `sensitive-status-${suffix}`),
					redactedMetadata: { status: "Bearer secret" },
				},
			}),
		);
		await expectRejected(() =>
			db.inboundSourceReceipt.create({
				data: {
					...receiptData(`metadata-${suffix}`, `long-string-${suffix}`),
					redactedMetadata: { cursor: "x".repeat(513) },
				},
			}),
		);
		await expectRejected(() =>
			db.inboundSourceReceipt.create({
				data: {
					...receiptData(`metadata-${suffix}`, `too-large-${suffix}`),
					redactedMetadata: { cursor: "x".repeat(16_500) },
				},
			}),
		);
	});

	it("guards parity for unavoidable inbound SQL functions and triggers", async () => {
		const functions = await db.$queryRaw<Array<{ proname: string }>>`
			SELECT proname
			FROM pg_proc
			WHERE proname IN (
				'validateInboundRedactedMetadata',
				'canonicalizeInboundText',
				'encodeInboundCanonicalComponent',
				'populateContactCandidateCanonicalIdentity',
				'populateContactCandidateObservationIdentity',
				'protectAppliedEntityFieldProvenance',
				'protectAppliedEntityLinkProvenance',
				'protectInboundSourceReceipt'
			)
		`;
		expect(new Set(functions.map(({ proname }) => proname))).toEqual(
			new Set([
				"validateInboundRedactedMetadata",
				"canonicalizeInboundText",
				"encodeInboundCanonicalComponent",
				"populateContactCandidateCanonicalIdentity",
				"populateContactCandidateObservationIdentity",
				"protectAppliedEntityFieldProvenance",
				"protectAppliedEntityLinkProvenance",
				"protectInboundSourceReceipt",
			]),
		);
		const triggers = await db.$queryRaw<Array<{ tgname: string }>>`
			SELECT tgname
			FROM pg_trigger
			WHERE NOT tgisinternal
			AND tgname IN (
				'contactCandidate_canonicalIdentity_populate',
				'contactCandidateObservation_identity_populate',
				'entityFieldProvenance_applied_immutable',
				'entityLinkProvenance_applied_immutable',
				'inboundSourceReceipt_immutable'
			)
		`;
		expect(new Set(triggers.map(({ tgname }) => tgname))).toEqual(
			new Set([
				"contactCandidate_canonicalIdentity_populate",
				"contactCandidateObservation_identity_populate",
				"entityFieldProvenance_applied_immutable",
				"entityLinkProvenance_applied_immutable",
				"inboundSourceReceipt_immutable",
			]),
		);
	});
});
