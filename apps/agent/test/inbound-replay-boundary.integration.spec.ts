import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection, EmailProvider } from "@crm/db";
import { runInboundCandidateReplay } from "../agent/lib/inbound-replay";

const rawBoundaryCase = process.env.INBOUND_REPLAY_BOUNDARY_CASE;
const boundaryCount = rawBoundaryCase ? Number(rawBoundaryCase) : 0;
const boundaryPrefix = `000000-boundary-${rawBoundaryCase ?? "unset"}`;
const websiteIds = Array.from(
	{ length: boundaryCount },
	(_, index) => `${boundaryPrefix}-website-${String(index).padStart(4, "0")}`,
);
const threadIds = Array.from(
	{ length: boundaryCount },
	(_, index) => `${boundaryPrefix}-thread-${String(index).padStart(4, "0")}`,
);
const messageIds = Array.from(
	{ length: boundaryCount },
	(_, index) => `${boundaryPrefix}-message-${String(index).padStart(4, "0")}`,
);

if (!rawBoundaryCase) {
	describe.skip("inbound replay boundary integration", () => {
		it("requires INBOUND_REPLAY_BOUNDARY_CASE", () => undefined);
	});
} else {
	describe(`inbound replay boundary ${boundaryCount}`, () => {
		beforeAll(async () => {
			if (![101, 500, 501].includes(boundaryCount)) {
				throw new Error(
					"INBOUND_REPLAY_BOUNDARY_CASE must be 101, 500, or 501",
				);
			}
			await db.websiteEnquiry.createMany({
				data: websiteIds.map((externalId, index) => ({
					externalId,
					createdAtSource: new Date(
						`2026-08-01T12:${String(index % 60).padStart(2, "0")}:00.000Z`,
					),
					name: `Boundary Person ${index}`,
					email: `boundary-${boundaryCount}-${index}@boundary.example.test`,
					company: "Boundary Company",
					source: "boundary-test",
					sourcePath: "/boundary",
					utm: { boundary: boundaryCount },
					test: false,
				})),
			});
			await db.emailThread.createMany({
				data: threadIds.map((id, index) => ({
					id,
					rootMessageId: `root-${messageIds[index]}`,
					provider: EmailProvider.GMAIL,
					externalThreadId: id,
					firstMessageAt: new Date("2026-08-02T12:00:00.000Z"),
					lastMessageAt: new Date("2026-08-02T12:00:00.000Z"),
					messageCount: 1,
				})),
			});
			await db.emailMessage.createMany({
				data: messageIds.map((id, index) => ({
					id,
					threadId: threadIds[index],
					rfcMessageId: `<${id}@boundary.example.test>`,
					provider: EmailProvider.GMAIL,
					externalInboxId: `boundary-inbox-${boundaryCount}`,
					externalThreadId: threadIds[index],
					externalMessageId: id,
					direction: EmailDirection.INBOUND,
					fromEmail: "boundary-sender",
					fromName: null,
					recipients: [],
					subject: "not retained",
					body: "not retained",
					sentAt: new Date("2026-08-02T12:00:00.000Z"),
				})),
			});
		});

		afterAll(async () => {
			const receipts = await db.inboundSourceReceipt.findMany({
				where: { sourceObjectId: { in: [...websiteIds, ...messageIds] } },
				select: { id: true },
			});
			await db.contactCandidateObservation.deleteMany({
				where: { receiptId: { in: receipts.map((receipt) => receipt.id) } },
			});
			await db.contactCandidate.deleteMany({
				where: {
					canonicalEmail: {
						in: websiteIds.map(
							(_, index) =>
								`boundary-${boundaryCount}-${index}@boundary.example.test`,
						),
					},
				},
			});
			await db.emailMessage.deleteMany({ where: { id: { in: messageIds } } });
			await db.emailThread.deleteMany({ where: { id: { in: threadIds } } });
			await db.websiteEnquiry.deleteMany({
				where: { externalId: { in: websiteIds } },
			});
		});

		it("reports the final website and email windows", async () => {
			const result = await runInboundCandidateReplay();
			const processed = Math.min(boundaryCount, 500);
			expect(result.scanned).toBe(processed * 2);
			expect(result.receipts).toBe(processed * 2);
			expect(result.hasMore).toBe(boundaryCount === 501);
			expect(result.websiteDone).toBe(boundaryCount !== 501);
			expect(result.emailDone).toBe(boundaryCount !== 501);
			expect(result.nextWebsiteCursor).toBe(
				boundaryCount === 501 ? websiteIds[499] : null,
			);
			expect(result.nextEmailCursor).toBe(
				boundaryCount === 501 ? messageIds[499] : null,
			);
		});
	});
}
