import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
} from "bun:test";
import { db, EnrichmentStatus, type Prisma } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { runBrand } from "../agent/lib/brand";
import { settle } from "../agent/lib/enrichment";

/**
 * An install with no Context key still creates companies, and a `brand` task
 * with nowhere to look is consumed and marked done. What must survive that is
 * the *record*: the sign-in sweep re-queues companies whose enrichment never
 * succeeded, and it decides that on `enrichmentStatus` being PENDING or FAILED.
 *
 * `runBrand` returns without writing enrichment status when the key is missing,
 * so the row stays PENDING. `settle` on the enrichment path only writes over a
 * RUNNING row. Either path must leave PENDING companies re-queueable once a key
 * exists. A settle that wrote SKIPPED unconditionally would strand every
 * company added before the key, with nothing to say so.
 */
const created: string[] = [];
const tasks: string[] = [];

let savedSettings: Prisma.AppSettingUncheckedCreateInput | null = null;

beforeAll(async () => {
	savedSettings = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
	});
});

afterAll(async () => {
	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	if (savedSettings) {
		await db.appSetting.create({ data: savedSettings });
	}
});

afterEach(async () => {
	if (tasks.length > 0) {
		await db.agentTask.deleteMany({ where: { id: { in: tasks.splice(0) } } });
	}
	if (created.length === 0) return;
	await db.company.deleteMany({ where: { id: { in: created.splice(0) } } });
});

async function company(status: EnrichmentStatus) {
	const row = await db.company.create({
		data: {
			name: "Keyless Probe",
			domain: `keyless-${created.length}-${status}.test`.toLowerCase(),
			enrichmentStatus: status,
		},
		select: { id: true },
	});

	created.push(row.id);
	return row.id;
}

const subjectOf = (companyId: string) => ({
	id: `keyless-${companyId}`,
	kind: "brand",
	contactId: null,
	companyId,
	dealId: null,
});

async function retiredSubjectOf(companyId: string) {
	await db.$executeRaw`
		UPDATE "company"
		SET "updatedAt" = NOW() - INTERVAL '1 second'
		WHERE id = ${companyId}
	`;

	const row = await db.agentTask.create({
		data: {
			companyId,
			kind: "brand",
			reason: "keyless",
			attempts: 3,
			dueAt: new Date(),
			finishedAt: new Date(),
		},
		select: { id: true },
	});

	tasks.push(row.id);
	return { ...subjectOf(companyId), id: row.id };
}

const statusOf = async (id: string) =>
	(
		await db.company.findUnique({
			where: { id },
			select: { enrichmentStatus: true },
		})
	)?.enrichmentStatus;

describe("a brand task with no key", () => {
	it("leaves the company where the sweep will find it again", async () => {
		const id = await company(EnrichmentStatus.PENDING);

		await settle(
			subjectOf(id),
			EnrichmentStatus.SKIPPED,
			"Context.dev is not configured, so there is nowhere to look.",
		);

		expect(await statusOf(id)).toBe(EnrichmentStatus.PENDING);
	});

	it("does not strand a company that had already failed", async () => {
		const id = await company(EnrichmentStatus.FAILED);

		await settle(subjectOf(id), EnrichmentStatus.SKIPPED, "no key");

		expect(await statusOf(id)).toBe(EnrichmentStatus.FAILED);
	});

	it("still settles a lookup that genuinely ran", async () => {
		const id = await company(EnrichmentStatus.RUNNING);

		await settle(subjectOf(id), EnrichmentStatus.SKIPPED, "No brand.");

		expect(await statusOf(id)).toBe(EnrichmentStatus.SKIPPED);
	});

	it("records a failure on a company that never started", async () => {
		const id = await company(EnrichmentStatus.PENDING);

		await settle(
			await retiredSubjectOf(id),
			EnrichmentStatus.FAILED,
			"Research was attempted several times and never completed.",
		);

		expect(await statusOf(id)).toBe(EnrichmentStatus.FAILED);
	});

	it("does not revive a company that already completed", async () => {
		const id = await company(EnrichmentStatus.COMPLETE);

		await settle(
			await retiredSubjectOf(id),
			EnrichmentStatus.FAILED,
			"too late",
		);

		expect(await statusOf(id)).toBe(EnrichmentStatus.COMPLETE);
	});

	it("runBrand leaves PENDING when Context is not configured", async () => {
		await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });

		const id = await company(EnrichmentStatus.PENDING);
		const result = await runBrand({ companyId: id });

		expect(result.enriched).toBe(false);
		expect(result.reason).toContain("not configured");
		expect(await statusOf(id)).toBe(EnrichmentStatus.PENDING);
	});
});
