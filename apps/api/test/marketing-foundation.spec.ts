import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { MarketingService } from "../src/marketing/marketing.service";
import { OperatingKernelAccessService } from "../src/operating-kernel/operating-kernel-access.service";

const suffix = crypto.randomUUID();
const userId = `marketing-user-${suffix}`;
const memberId = `marketing-member-${suffix}`;
const requestId = crypto.randomUUID();
const campaignName = `Marketing foundation ${suffix}`;
const marketing = new MarketingService(
	db,
	new OperatingKernelAccessService(db),
);

async function clean() {
	const campaignIds = (
		await db.campaign.findMany({
			where: {
				OR: [
					{ id: `campaign-${requestId}` },
					{ name: campaignName },
					{ sourceReceipts: { some: { externalId: `plan:${requestId}` } } },
				],
			},
			select: { id: true },
		})
	).map((row) => row.id);
	await db.publication.deleteMany({
		where: { campaignId: { in: campaignIds } },
	});
	await db.actionReceipt.deleteMany({
		where: {
			OR: [
				{ idempotencyKey: requestId },
				{
					idempotencyKey: {
						startsWith: `marketing:publication:publication-${requestId}`,
					},
				},
			],
		},
	});
	await db.approvalRequest.deleteMany({
		where: { targetType: "CAMPAIGN", targetId: { in: campaignIds } },
	});
	await db.workItem.deleteMany({
		where: { subjectType: "CAMPAIGN", subjectId: { in: campaignIds } },
	});
	await db.triageProposal.deleteMany({
		where: { campaignId: { in: campaignIds } },
	});
	await db.attributionCredit.deleteMany({
		where: { campaignId: { in: campaignIds } },
	});
	await db.marketingTouchpoint.deleteMany({
		where: { campaignId: { in: campaignIds } },
	});
	await db.marketingSourceReceipt.deleteMany({
		where: { campaignId: { in: campaignIds } },
	});
	await db.contentVariant.deleteMany({
		where: { contentItem: { campaignId: { in: campaignIds } } },
	});
	await db.experiment.deleteMany({
		where: { campaignId: { in: campaignIds } },
	});
	await db.contentItem.deleteMany({
		where: { campaignId: { in: campaignIds } },
	});
	await db.campaign.deleteMany({ where: { id: { in: campaignIds } } });
	await db.member.deleteMany({ where: { id: memberId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		update: {},
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
	await db.user.create({
		data: {
			id: userId,
			name: "Marketing User",
			email: `${userId}@test.dev`,
		},
	});
	await db.member.create({
		data: {
			id: memberId,
			organizationId: WORKSPACE_ID,
			userId,
			role: "member",
			createdAt: new Date(),
		},
	});
});

afterAll(clean);

describe("marketing planning foundation", () => {
	it("creates a governed campaign plan once without provider execution", async () => {
		const input = {
			name: campaignName,
			channel: "email",
			objective: "Validate attribution and approval-only publishing.",
			contentKind: "newsletter",
			contentTitle: "August operations update",
			contentBody: "A human-reviewed update for existing customers.",
			audience: "customers",
			sourceUrl: "https://example.test/source",
			startsAt: "2026-08-11T10:00:00.000Z",
			scheduledAt: "2026-08-12T09:00:00.000Z",
			budgetAmount: 250,
			currency: "GBP",
			clientRequestId: requestId,
		};
		const result = await marketing.plan(input, userId);
		const replay = await marketing.plan(input, userId);
		expect(replay).toEqual(result);

		const campaign = await db.campaign.findUnique({
			where: { id: result.campaignId },
			select: {
				status: true,
				channel: true,
				budget: true,
				currency: true,
				metadata: true,
				_count: {
					select: {
						contentItems: true,
						experiments: true,
						triageProposals: true,
						touchpoints: true,
						attributionCredits: true,
						publications: true,
						sourceReceipts: true,
					},
				},
			},
		});
		if (!campaign) throw new Error("Missing marketing campaign.");
		expect(campaign.status).toBe("DRAFT");
		expect(campaign.channel).toBe("email");
		expect(campaign.budget?.toString()).toBe("250");
		expect(campaign.currency).toBe("GBP");
		expect(campaign._count).toMatchObject({
			contentItems: 1,
			experiments: 1,
			triageProposals: 1,
			touchpoints: 1,
			attributionCredits: 1,
			publications: 1,
			sourceReceipts: 1,
		});
		expect(
			(campaign.metadata as { publishingDisabled?: boolean })
				.publishingDisabled,
		).toBe(true);

		const publication = await db.publication.findUnique({
			where: { id: result.publicationId },
			select: {
				status: true,
				provider: true,
				channel: true,
				approvalRequestId: true,
				actionReceiptId: true,
				scheduledAt: true,
				publishedAt: true,
				externalId: true,
				receipt: true,
			},
		});
		expect(publication).toMatchObject({
			status: "PLANNED",
			provider: "lode-crm",
			channel: "email",
			approvalRequestId: result.approvalRequestId,
			actionReceiptId: result.proposalReceiptId,
			publishedAt: null,
			externalId: null,
		});
		if (!publication) throw new Error("Missing marketing publication.");
		expect(publication.scheduledAt?.toISOString()).toBe(
			"2026-08-12T09:00:00.000Z",
		);
		expect(
			(publication.receipt as { publishingDisabled?: boolean })
				.publishingDisabled,
		).toBe(true);

		const approval = await db.approvalRequest.findUnique({
			where: { id: result.approvalRequestId },
			select: {
				action: true,
				status: true,
				targetType: true,
				targetId: true,
				risk: true,
				contentSnapshot: true,
			},
		});
		expect(approval).toMatchObject({
			action: "marketing.publication.approve",
			status: "PENDING",
			targetType: "CAMPAIGN",
			targetId: result.campaignId,
			risk: "MEDIUM",
		});
		if (!approval) throw new Error("Missing marketing approval.");
		expect(
			(approval.contentSnapshot as { adSpendMutationDisabled?: boolean })
				.adSpendMutationDisabled,
		).toBe(true);

		const work = await db.workItem.findUnique({
			where: { id: result.workItemId },
			select: {
				subjectType: true,
				queue: true,
				state: true,
				primaryAction: true,
				evidence: true,
			},
		});
		expect(work).toMatchObject({
			subjectType: "CAMPAIGN",
			queue: "marketing",
			state: "OPEN",
			primaryAction: "Review marketing plan",
		});
		if (!work) throw new Error("Missing marketing work item.");
		expect(
			(work.evidence as { providerMutationDisabled?: boolean })
				.providerMutationDisabled,
		).toBe(true);

		const receipts = await db.actionReceipt.findMany({
			where: {
				OR: [{ idempotencyKey: requestId }, { id: result.proposalReceiptId }],
			},
			orderBy: { operationKey: "asc" },
			select: {
				operationKey: true,
				status: true,
				costUsd: true,
				result: true,
				approvalRequestId: true,
			},
		});
		expect(receipts).toHaveLength(2);
		expect(receipts.every((receipt) => receipt.status === "SUCCEEDED")).toBe(
			true,
		);
		expect(
			receipts.every((receipt) => receipt.costUsd?.toString() === "0"),
		).toBe(true);
		expect(
			receipts.some(
				(receipt) => receipt.operationKey === "marketing.plan.propose",
			),
		).toBe(true);
		expect(
			receipts.some(
				(receipt) =>
					receipt.operationKey === "marketing.publication.propose" &&
					receipt.approvalRequestId === result.approvalRequestId,
			),
		).toBe(true);
		const firstReceipt = receipts[0];
		if (!firstReceipt) throw new Error("Missing marketing receipt.");
		expect(
			(firstReceipt.result as { modelExecutionDisabled?: boolean })
				.modelExecutionDisabled,
		).toBe(true);

		const listed = await marketing.list({
			q: campaignName,
			sort: "updatedAt",
			dir: "desc",
			page: 1,
			pageSize: 25,
			status: "DRAFT",
			channel: "email",
			owner: "all",
		});
		expect(listed.rows).toHaveLength(1);
		expect(listed.rows[0]?.counts.openWork).toBe(1);
		expect(listed.rows[0]?.counts.pendingApprovals).toBe(1);
		expect(listed.rows[0]?.disabledReasons.join(" ")).toContain("disabled");

		const detail = await marketing.byId(result.campaignId);
		expect(detail.contentItems).toHaveLength(1);
		expect(detail.publications).toHaveLength(1);
		expect(detail.work).toHaveLength(1);
		expect(detail.approvals).toHaveLength(1);
		expect(detail.receipts).toHaveLength(2);
		expect(detail.touchpoints[0]?.attributionCredits).toHaveLength(1);
	});
});
