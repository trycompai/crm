import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { CustomersService } from "../src/customers/customers.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { OperatingKernelCleanupService } from "../src/operating-kernel/operating-kernel-cleanup.service";

const suffix = crypto.randomUUID();
const userId = `customer-owner-${suffix}`;
const domain = `customer-${suffix}.example.test`;
const deals = new DealsService(
	db,
	new AgentTriggerService(db),
	new ActivityStampService(db),
	new ConversionService(db),
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
	new OperatingKernelCleanupService(),
);
const customers = new CustomersService(db);

let companyId = "";
let dealId = "";

async function clean() {
	const company = await db.company.findUnique({
		where: { domain },
		select: { id: true },
	});
	if (company) {
		const account = await db.customerAccount.findUnique({
			where: { companyId: company.id },
			select: { id: true },
		});
		const dealIds = (
			await db.deal.findMany({
				where: { companyId: company.id },
				select: { id: true },
			})
		).map((row) => row.id);
		await db.actionReceipt.deleteMany({
			where: {
				idempotencyKey: {
					in: dealIds.map((id) => `customers:closed-won:${id}`),
				},
			},
		});
		await db.approvalRequest.deleteMany({
			where: {
				idempotencyKey: {
					in: dealIds.map((id) => `customers:onboarding:${id}:approval`),
				},
			},
		});
		await db.workItem.deleteMany({
			where: {
				id: {
					in: dealIds.flatMap((id) => [
						`customer-onboarding:${id}:intake`,
						`customer-onboarding:${id}:instance-discovery`,
					]),
				},
			},
		});
		if (account) {
			await db.customerInstance.deleteMany({
				where: { accountId: account.id },
			});
			await db.customerAccount.delete({ where: { id: account.id } });
		}
		await db.customerOnboarding.deleteMany({
			where: { dealId: { in: dealIds } },
		});
		await db.agentTask.deleteMany({
			where: { kind: "customer-onboarding-plan", dealId: { in: dealIds } },
		});
		await db.deal.deleteMany({ where: { id: { in: dealIds } } });
		await db.company.delete({ where: { id: company.id } });
	}
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Customer Owner", email: `${userId}@test.dev` },
	});
	const company = await db.company.create({
		data: { name: `Closed Won Customer ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;
	const deal = await deals.create({
		name: `Won onboarding ${suffix}`,
		companyId,
		ownerId: userId,
	});
	dealId = deal.id;
});

afterAll(clean);

describe("closed-won customer onboarding foundation", () => {
	it("creates customer, instance, work, approval and receipt records once", async () => {
		await deals.setStage({ id: dealId, stage: "CLOSED_WON" }, userId);
		await deals.setStage({ id: dealId, stage: "CLOSED_WON" }, userId);

		const onboarding = await db.customerOnboarding.findUnique({
			where: { dealId },
			select: {
				id: true,
				items: {
					orderBy: { position: "asc" },
					select: { kind: true, name: true, details: true, source: true },
				},
			},
		});
		expect(onboarding?.items).toHaveLength(7);
		expect(onboarding?.items[0]?.name).toBe(
			"Confirm objectives and measurable success outcomes",
		);
		expect(
			onboarding?.items.every(
				(item) => item.source === "closed-won-foundation",
			),
		).toBe(true);

		const account = await db.customerAccount.findUnique({
			where: { companyId },
			select: {
				id: true,
				status: true,
				customerOnboardingId: true,
				metadata: true,
			},
		});
		if (!onboarding || !account)
			throw new Error("Missing customer foundation.");
		expect(account.status).toBe("ACTIVE");
		expect(account.customerOnboardingId).toBe(onboarding.id);
		expect(
			(
				account.metadata as {
					onboardingFoundation?: { requiredGaps?: string[] };
				}
			).onboardingFoundation?.requiredGaps,
		).toContain("successMeasures");

		const instances = await db.customerInstance.findMany({
			where: { accountId: account.id },
			select: { key: true, status: true, metadata: true },
		});
		expect(instances).toHaveLength(1);
		expect(instances[0]).toMatchObject({
			key: `onboarding-${dealId}`,
			status: "DISCOVERED",
		});

		const work = await db.workItem.findMany({
			where: {
				id: {
					in: [
						`customer-onboarding:${dealId}:intake`,
						`customer-onboarding:${dealId}:instance-discovery`,
					],
				},
			},
			orderBy: { queue: "asc" },
			select: {
				queue: true,
				state: true,
				subjectType: true,
				primaryAction: true,
				evidence: true,
			},
		});
		expect(work).toHaveLength(2);
		expect(work.map((item) => item.queue).sort()).toEqual([
			"customers",
			"instances",
		]);
		expect(work.every((item) => item.state === "OPEN")).toBe(true);
		expect(work.some((item) => item.subjectType === "CUSTOMER_ACCOUNT")).toBe(
			true,
		);
		expect(work.some((item) => item.subjectType === "CUSTOMER_INSTANCE")).toBe(
			true,
		);
		expect(
			work.every(
				(item) =>
					(item.evidence as { providerMutationDisabled?: boolean })
						.providerMutationDisabled === true,
			),
		).toBe(true);

		const approvals = await db.approvalRequest.findMany({
			where: { idempotencyKey: `customers:onboarding:${dealId}:approval` },
			select: {
				action: true,
				status: true,
				targetType: true,
				targetId: true,
				risk: true,
				contentSnapshot: true,
			},
		});
		expect(approvals).toHaveLength(1);
		const approval = approvals[0];
		if (!approval) throw new Error("Missing onboarding approval.");
		expect(approval).toMatchObject({
			action: "customers.onboarding.plan.approve",
			status: "PENDING",
			targetType: "CUSTOMER_ACCOUNT",
			targetId: account.id,
			risk: "HIGH",
		});
		expect(
			(approval.contentSnapshot as { modelExecutionDisabled?: boolean })
				.modelExecutionDisabled,
		).toBe(true);

		const receipts = await db.actionReceipt.findMany({
			where: { idempotencyKey: `customers:closed-won:${dealId}` },
			select: { operationKey: true, status: true, result: true },
		});
		expect(receipts).toHaveLength(1);
		const receipt = receipts[0];
		if (!receipt) throw new Error("Missing closed-won receipt.");
		expect(receipt.operationKey).toBe("customers.closed-won.ensure");
		expect(receipt.status).toBe("SUCCEEDED");
		expect(
			(receipt.result as { providerMutationDisabled?: boolean })
				.providerMutationDisabled,
		).toBe(true);

		await deals.setStage({ id: dealId, stage: "CLOSED_WON" }, userId);
		expect(
			await db.workItem.count({
				where: {
					id: {
						in: [
							`customer-onboarding:${dealId}:intake`,
							`customer-onboarding:${dealId}:instance-discovery`,
						],
					},
				},
			}),
		).toBe(2);
		expect(
			await db.agentTask.count({
				where: { kind: "customer-onboarding-plan", dealId },
			}),
		).toBe(0);

		const listed = await customers.list({
			q: domain,
			sort: "updatedAt",
			dir: "desc",
			page: 1,
			pageSize: 25,
			status: "ACTIVE",
			onboardingStatus: "all",
			owner: "all",
		});
		expect(listed.rows).toHaveLength(1);
		expect(listed.rows[0]?.counts.openWork).toBe(2);
		expect(listed.rows[0]?.counts.pendingApprovals).toBe(1);
		expect(listed.rows[0]?.gaps).toContain("instanceDiscovery");

		const detail = await customers.byId(account.id);
		expect(detail.instances).toHaveLength(1);
		expect(detail.work).toHaveLength(2);
		expect(detail.approvals).toHaveLength(1);
		expect(detail.receipts).toHaveLength(1);
		expect(detail.disabledReasons.join(" ")).toContain("disabled");
	});
});
