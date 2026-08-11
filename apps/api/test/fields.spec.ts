import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db, type FieldEntity } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import type { FaviconService } from "../src/companies/favicon.service";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "fields-spec";
const domain = `fields-${suffix}.test`;
const ownerId = `owner-${suffix}`;

const queued: { entity: FieldEntity; key: string; reason: string }[] = [];

const agent = {
	contactCreated: async () => undefined,
	companyCreated: async () => undefined,
	companyRequested: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	fieldBackfill: async (entity: FieldEntity, key: string, reason: string) => {
		queued.push({ entity, key, reason });
	},
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const queue = new AgentQueueService(db);
const conversion = new ConversionService(db);

const fields = new FieldsService(db, agent);
const companies = new CompaniesService(
	db,
	agent,
	queue,
	{ backfill: async () => undefined } as unknown as FaviconService,
	stamp,
	conversion,
	fields,
);
const contacts = new ContactsService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	queue,
	stamp,
	fields,
);
const deals = new DealsService(db, agent, stamp, conversion, fields);

let companyId: string;
let bridgeSecret: string | undefined;

async function clean() {
	const owned = await db.company.findMany({
		where: { domain: { endsWith: domain } },
		select: { id: true },
	});
	const companyIds = owned.map((row) => row.id);

	await db.agentTask.deleteMany({
		where: { kind: "field-backfill", reason: { contains: "spec_" } },
	});
	await db.deal.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.contact.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.fieldValue.deleteMany({
		where: { companyId: { in: companyIds } },
	});
	await db.fieldDefinition.deleteMany({
		where: { key: { startsWith: "spec_" } },
	});
	await db.company.deleteMany({ where: { domain: { endsWith: domain } } });
	await db.user.deleteMany({ where: { id: ownerId } });
}

async function makeCompany(name: string): Promise<string> {
	const company = await db.company.create({
		data: { name: `${name} ${suffix}`, domain: `${name}-${domain}` },
		select: { id: true },
	});

	return company.id;
}

beforeAll(async () => {
	bridgeSecret = process.env.AGENT_BRIDGE_SECRET;
	process.env.AGENT_BRIDGE_SECRET = "";

	await clean();

	await db.user.create({
		data: { id: ownerId, name: "Fields Rep", email: `rep@${domain}` },
	});

	companyId = await makeCompany("fields-co");
});

afterAll(async () => {
	await clean();

	if (bridgeSecret === undefined) {
		delete process.env.AGENT_BRIDGE_SECRET;
	} else {
		process.env.AGENT_BRIDGE_SECRET = bridgeSecret;
	}
});

beforeEach(() => {
	queued.length = 0;
});

describe("field definitions", () => {
	it("derives a key from the label and queues a backfill", async () => {
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
		expect(queued).toEqual([
			{ entity: "COMPANY", key: "spec_runs_on", reason: "New field" },
		]);
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

		await expect(fields.update(field.id, { type: "TEXT" })).rejects.toThrow(
			/cannot change/,
		);
	});

	it("will not turn a field into a select with nothing to choose", async () => {
		const field = await fields.create({
			entity: "DEAL",
			label: "Spec plain",
			type: "TEXT",
			options: [],
			agentFilled: false,
			agentBrief: null,
			required: false,
			showOnSheet: true,
			showOnTable: false,
		});

		await expect(fields.update(field.id, { type: "SELECT" })).rejects.toThrow(
			/at least one option/,
		);
	});

	it("archives without losing values, and restores them", async () => {
		const field = await fields.byKey("COMPANY", "spec_runs_on");

		await fields.archive(field.id);

		expect(
			(await fields.valuesFor("COMPANY", companyId)).map((entry) => entry.key),
		).not.toContain("spec_runs_on");
		expect(await db.fieldValue.count({ where: { fieldId: field.id } })).toBe(1);

		await fields.restore(field.id);

		const back = await fields.valuesFor("COMPANY", companyId);
		expect(back.map((entry) => entry.key)).toContain("spec_runs_on");
	});

	it("says a field is missing without swallowing other failures", async () => {
		const missing = `missing-${suffix}`;

		await expect(fields.archive(missing)).rejects.toThrow(/does not exist/);
		await expect(fields.restore(missing)).rejects.toThrow(/does not exist/);
		await expect(fields.delete(missing)).rejects.toThrow(/does not exist/);
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

		const keys = reordered.map((field) => field.key);

		expect(keys).toContain("spec_seats");
		expect(keys.indexOf("spec_seats")).toBeLessThan(
			keys.indexOf("spec_runs_on"),
		);

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

	it("takes a date as ISO 8601 and nothing else", async () => {
		const record = await makeCompany("dates");

		await fields.applyValues(db, "COMPANY", record, {
			spec_renewal: "2027-03-31T12:30:00.000Z",
		});

		const values = await fields.valuesFor("COMPANY", record);
		const renewal = values.find((field) => field.key === "spec_renewal");
		expect(renewal?.value).toBe("2027-03-31T12:30:00.000Z");

		for (const raw of ["2027/03/31", "03-31-2027", "31 March 2027"]) {
			await expect(
				fields.applyValues(db, "COMPANY", record, { spec_renewal: raw }),
			).rejects.toThrow(/takes a date/);
		}

		expect(
			(await fields.valuesFor("COMPANY", record)).find(
				(field) => field.key === "spec_renewal",
			)?.value,
		).toBe("2027-03-31T12:30:00.000Z");
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

	it("writes none of a batch when one value in it is refused", async () => {
		const record = await makeCompany("batch");

		await expect(
			fields.applyValues(db, "COMPANY", record, {
				spec_seats: "12",
				spec_renewal: "the spring",
			}),
		).rejects.toThrow(/takes a date/);

		expect(await db.fieldValue.count({ where: { companyId: record } })).toBe(0);
	});

	it("refuses a user who does not work here, and keeps the batch out", async () => {
		const record = await makeCompany("people");

		await fields.create({
			entity: "COMPANY",
			label: "Spec champion",
			type: "USER",
			options: [],
			agentFilled: false,
			agentBrief: null,
			required: false,
			showOnSheet: true,
			showOnTable: false,
		});

		await expect(
			fields.applyValues(db, "COMPANY", record, {
				spec_seats: "12",
				spec_champion: `nobody-${suffix}`,
			}),
		).rejects.toThrow(/works here/);

		expect(await db.fieldValue.count({ where: { companyId: record } })).toBe(0);

		await fields.applyValues(db, "COMPANY", record, {
			spec_champion: ownerId,
		});

		expect(
			(await fields.valuesFor("COMPANY", record)).find(
				(field) => field.key === "spec_champion",
			)?.value,
		).toBe(ownerId);
	});

	it("clears a value when it is blanked", async () => {
		await fields.applyValues(db, "COMPANY", companyId, { spec_seats: "" });

		const values = await fields.valuesFor("COMPANY", companyId);
		const seats = values.find((field) => field.key === "spec_seats");

		expect(seats?.value).toBeNull();
	});

	it("goes with the record when the record is deleted", async () => {
		const doomed = await makeCompany("doomed");

		await fields.applyValues(db, "COMPANY", doomed, {
			spec_renewal: "2027-01-01",
		});

		await db.company.delete({ where: { id: doomed } });

		expect(await db.fieldValue.count({ where: { companyId: doomed } })).toBe(0);
	});
});

describe("a select option that was taken away", () => {
	it("still labels what it left behind, but cannot be chosen again", async () => {
		const record = await makeCompany("retired");

		const field = await fields.create({
			entity: "COMPANY",
			label: "Spec tier",
			type: "SELECT",
			options: [{ label: "Gold" }, { label: "Silver" }],
			agentFilled: false,
			agentBrief: null,
			required: false,
			showOnSheet: true,
			showOnTable: false,
		});

		const gold = field.options.find((option) => option.label === "Gold");
		const silver = field.options.find((option) => option.label === "Silver");

		await fields.applyValues(db, "COMPANY", record, { spec_tier: "Gold" });

		await fields.update(field.id, {
			options: [{ id: silver?.id, label: "Silver" }],
		});

		const [tier] = (await fields.valuesFor("COMPANY", record)).filter(
			(entry) => entry.key === "spec_tier",
		);

		expect(tier?.value).toBe(gold?.id);
		expect(tier?.options.find((option) => option.id === gold?.id)?.label).toBe(
			"Gold",
		);

		expect(
			(await fields.byKey("COMPANY", "spec_tier")).options.map(
				(option) => option.label,
			),
		).toEqual(["Silver"]);

		await expect(
			fields.applyValues(db, "COMPANY", record, { spec_tier: "Gold" }),
		).rejects.toThrow(/no option/);
	});

	it("still reads as a label in a table, not as an option id", async () => {
		const record = await makeCompany("retired-table");

		const field = await fields.create({
			entity: "COMPANY",
			label: "Spec plan",
			type: "SELECT",
			options: [{ label: "Pilot" }, { label: "Rollout" }],
			agentFilled: false,
			agentBrief: null,
			required: false,
			showOnSheet: true,
			showOnTable: true,
		});

		const rollout = field.options.find((option) => option.label === "Rollout");

		await fields.applyValues(db, "COMPANY", record, { spec_plan: "Pilot" });

		await fields.update(field.id, {
			options: [{ id: rollout?.id, label: "Rollout" }],
		});

		const table = await fields.tableValuesFor("COMPANY", [record]);

		expect(table.get(record)?.spec_plan).toBe("Pilot");
	});
});

describe("a record update that fails", () => {
	it("leaves a company's field values as they were", async () => {
		const record = await makeCompany("company-rollback");

		await expect(
			companies.update(record, {
				name: "Renamed",
				ownerId: `nobody-${suffix}`,
				fields: { spec_seats: "99" },
			}),
		).rejects.toThrow();

		expect(await db.fieldValue.count({ where: { companyId: record } })).toBe(0);
	});

	it("leaves a contact's field values as they were", async () => {
		await fields.create({
			entity: "CONTACT",
			label: "Spec note",
			type: "TEXT",
			options: [],
			agentFilled: false,
			agentBrief: null,
			required: false,
			showOnSheet: true,
			showOnTable: false,
		});

		const contact = await db.contact.create({
			data: {
				firstName: "Ada",
				email: `ada@${domain}`,
				companyId,
			},
			select: { id: true },
		});

		await expect(
			contacts.update(contact.id, {
				companyId: `nobody-${suffix}`,
				fields: { spec_note: "Reads the docs" },
			}),
		).rejects.toThrow();

		expect(
			await db.fieldValue.count({ where: { contactId: contact.id } }),
		).toBe(0);
	});

	it("leaves a deal's field values as they were", async () => {
		await fields.create({
			entity: "DEAL",
			label: "Spec risk",
			type: "TEXT",
			options: [],
			agentFilled: false,
			agentBrief: null,
			required: false,
			showOnSheet: true,
			showOnTable: false,
		});

		const deal = await db.deal.create({
			data: { name: `Spec deal ${suffix}`, companyId, ownerId },
			select: { id: true },
		});

		await expect(
			deals.update(deal.id, {
				companyId: `nobody-${suffix}`,
				fields: { spec_risk: "Champion left" },
			}),
		).rejects.toThrow();

		expect(await db.fieldValue.count({ where: { dealId: deal.id } })).toBe(0);

		await deals.update(deal.id, { fields: { spec_risk: "Champion left" } });

		expect(await db.fieldValue.count({ where: { dealId: deal.id } })).toBe(1);
	});
});

describe("queueing a backfill", () => {
	it("keeps one entity's field apart from another's with the same key", async () => {
		const trigger = new AgentTriggerService(db);

		await trigger.fieldBackfill("COMPANY", "spec_website", "New field");
		await trigger.fieldBackfill("CONTACT", "spec_website", "New field");
		await trigger.fieldBackfill("COMPANY", "spec_website", "Brief changed");

		const tasks = await db.agentTask.findMany({
			where: { kind: "field-backfill", reason: { contains: "spec_website" } },
			select: { reason: true },
		});

		expect(tasks.map((task) => task.reason).sort()).toEqual([
			"company.spec_website: New field",
			"contact.spec_website: New field",
		]);
	});
});
