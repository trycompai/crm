import { afterEach, describe, expect, it } from "bun:test";
import { db, EnrichmentStatus } from "@crm/db";
import { settle } from "../agent/lib/enrichment";

/**
 * An install with no Context key still creates companies, and a `brand` task
 * with nowhere to look is consumed and marked done. What must survive that is
 * the *record*: the sign-in sweep re-queues companies whose enrichment never
 * succeeded, and it decides that on `enrichmentStatus` being PENDING or FAILED.
 *
 * `runBrand` settles SKIPPED before anything marks the row RUNNING, and
 * `settle` only writes over a RUNNING row — so the row stays PENDING and the
 * sweep picks it up once a key exists. That is load bearing and entirely
 * implicit, which is why it is pinned here: a `settle` that wrote
 * unconditionally would strand every company added before the key, with
 * nothing to say so.
 */
const created: string[] = [];

afterEach(async () => {
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
			{ companyId: id },
			EnrichmentStatus.SKIPPED,
			"Context.dev is not configured, so there is nowhere to look.",
		);

		expect(await statusOf(id)).toBe(EnrichmentStatus.PENDING);
	});

	it("does not strand a company that had already failed", async () => {
		const id = await company(EnrichmentStatus.FAILED);

		await settle({ companyId: id }, EnrichmentStatus.SKIPPED, "no key");

		expect(await statusOf(id)).toBe(EnrichmentStatus.FAILED);
	});

	it("still settles a lookup that genuinely ran", async () => {
		const id = await company(EnrichmentStatus.RUNNING);

		await settle({ companyId: id }, EnrichmentStatus.SKIPPED, "No brand.");

		expect(await statusOf(id)).toBe(EnrichmentStatus.SKIPPED);
	});
});
