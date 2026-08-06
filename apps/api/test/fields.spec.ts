import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { FieldsService } from "../src/fields/fields.service";

const suffix = process.env.TEST_RUN_ID ?? "fields-spec";
const domain = `fields-${suffix}.test`;

const queued: { key: string; reason: string }[] = [];

const agent = {
	fieldBackfill: async (key: string, reason: string) => {
		queued.push({ key, reason });
	},
} as unknown as AgentTriggerService;

const fields = new FieldsService(db, agent);

let companyId: string;

async function clean() {
	const owned = await db.company.findMany({
		where: { domain },
		select: { id: true },
	});

	await db.fieldValue.deleteMany({
		where: { companyId: { in: owned.map((row) => row.id) } },
	});
	await db.fieldDefinition.deleteMany({
		where: { key: { startsWith: "spec_" } },
	});
	await db.company.deleteMany({ where: { domain } });
}

beforeAll(async () => {
	await clean();

	const company = await db.company.create({
		data: { name: `Fields Co ${suffix}`, domain },
		select: { id: true },
	});

	companyId = company.id;
});

afterAll(clean);

describe("field definitions", () => {
	it("derives a key from the label and queues a backfill", async () => {
		queued.length = 0;

		const field = await fields.create({
			entity: "COMPANY",
			label: "Spec runs on",
			type: "SELECT",
			options: [{ label: "AWS" }, { label: "Azure" }],
			agentFilled: true,
			agentBrief: "Which cloud they run production on.",
			required: false,
			showOnSheet: true,
			showOnTable: false,
		});

		expect(field.key).toBe("spec_runs_on");
		expect(field.options.map((option) => option.label)).toEqual([
			"AWS",
			"Azure",
		]);
		expect(queued).toEqual([{ key: "spec_runs_on", reason: "New field" }]);
	});

	it("refuses a duplicate key", async () => {
		await expect(
			fields.create({
				entity: "COMPANY",
				label: "Spec runs on",
				type: "TEXT",
				options: [],
				agentFilled: false,
				agentBrief: null,
				required: false,
				showOnSheet: true,
				showOnTable: false,
			}),
		).rejects.toThrow(/already a field/);
	});

	it("keeps the same key when the label is renamed", async () => {
		const before = await fields.byKey("COMPANY", "spec_runs_on");

		const after = await fields.update(before.id, { label: "Spec cloud" });

		expect(after.key).toBe("spec_runs_on");
		expect(after.label).toBe("Spec cloud");
	});

	it("will not retype a field that already holds values", async () => {
		const field = await fields.byKey("COMPANY", "spec_runs_on");

		await fields.applyValues(db, "COMPANY", companyId, {
			spec_runs_on: "AWS",
		});

		await expect(
			fields.update(field.id, { type: "TEXT" }),
		).rejects.toThrow(/cannot change/);
	});

	it("archives without losing values, and restores them", async () => {
		const field = await fields.byKey("COMPANY", "spec_runs_on");

		await fields.archive(field.id);

		expect(await fields.valuesFor("COMPANY", companyId)).toEqual([]);
		expect(
			await db.fieldValue.count({ where: { fieldId: field.id } }),
		).toBe(1);

		await fields.restore(field.id);

		const back = await fields.valuesFor("COMPANY", companyId);
		expect(back).toHaveLength(1);
		expect(back[0]?.key).toBe("spec_runs_on");
	});

	it("reorders inside one entity only", async () => {
		const second = await fields.create({
			entity: "COMPANY",
			label: "Spec seats",
			type: "NUMBER",
			options: [],
			agentFilled: false,
			agentBrief: null,
			required: false,
			showOnSheet: true,
			showOnTable: false,
		});

		const first = await fields.byKey("COMPANY", "spec_runs_on");

		const reordered = await fields.reorder({
			entity: "COMPANY",
			ids: [second.id, first.id],
		});

		expect(reordered.map((field) => field.key)).toEqual([
			"spec_seats",
			"spec_runs_on",
		]);

		await expect(
			fields.reorder({ entity: "CONTACT", ids: [first.id] }),
		).rejects.toThrow(/not on this record type/);
	});
});

describe("field values", () => {
	it("round-trips each storage class", async () => {
		await fields.create({
			entity: "COMPANY",
			label: "Spec renewal",
			type: "DATE",
			options: [],
			agentFilled: false,
			agentBrief: null,
			required: false,
			showOnSheet: true,
			showOnTable: false,
		});

		await fields.applyValues(db, "COMPANY", companyId, {
			spec_seats: "240",
			spec_renewal: "2027-03-31",
		});

		const values = await fields.valuesFor("COMPANY", companyId);
		const byKey = new Map(values.map((field) => [field.key, field.value]));

		expect(byKey.get("spec_seats")).toBe(240);
		expect(byKey.get("spec_renewal")).toBe("2027-03-31T00:00:00.000Z");
	});

	it("rejects a value the type cannot hold", async () => {
		await expect(
			fields.applyValues(db, "COMPANY", companyId, { spec_seats: "loads" }),
		).rejects.toThrow(/takes a number/);
	});

	it("rejects an unknown key", async () => {
		await expect(
			fields.applyValues(db, "COMPANY", companyId, { nope: "x" }),
		).rejects.toThrow(/no field called/);
	});

	it("clears a value when it is blanked", async () => {
		await fields.applyValues(db, "COMPANY", companyId, { spec_seats: "" });

		const values = await fields.valuesFor("COMPANY", companyId);
		const seats = values.find((field) => field.key === "spec_seats");

		expect(seats?.value).toBeNull();
	});

	it("goes with the record when the record is deleted", async () => {
		const doomed = await db.company.create({
			data: { name: `Doomed ${suffix}`, domain: `doomed-${domain}` },
			select: { id: true },
		});

		await fields.applyValues(db, "COMPANY", doomed.id, {
			spec_renewal: "2027-01-01",
		});

		await db.company.delete({ where: { id: doomed.id } });

		expect(
			await db.fieldValue.count({ where: { companyId: doomed.id } }),
		).toBe(0);
	});
});
