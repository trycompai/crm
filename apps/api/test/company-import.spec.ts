import { afterAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import type {
	AgentTriggerService,
	CrmEventInput,
} from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";
import type { FaviconService } from "../src/companies/favicon.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import type { FieldsService } from "../src/fields/fields.service";

const suffix = process.env.TEST_RUN_ID ?? "company-import-spec";
const domain = `company-import-${suffix}.test`;
const secondDomain = `second-company-import-${suffix}.test`;
const importedIds: string[] = [];
const events: CrmEventInput[] = [];
const lifecycleIds: string[][] = [];
const fieldBackfillIds: string[][] = [];

const agent = {
	companyCreated: async () => undefined,
	companiesCreated: async (ids: string[]) => {
		lifecycleIds.push(ids);
	},
	withCrmEvents: async <Result>(
		work: (
			tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
			emit: (input: CrmEventInput) => Promise<void>,
		) => Promise<Result>,
	) =>
		db.$transaction((tx) =>
			work(tx, async (input) => {
				events.push(input);
			}),
		),
} as unknown as AgentTriggerService;

const fields = {
	queueBackfillForNewRecords: async (_entity: string, ids: string[]) => {
		fieldBackfillIds.push(ids);
	},
} as unknown as FieldsService;

const favicon = {
	backfill: async () => false,
} as unknown as FaviconService;

const companies = new CompaniesService(
	db,
	agent,
	new AgentQueueService(db),
	favicon,
	new ActivityStampService(db),
	new ConversionService(db),
	fields,
);

async function clean() {
	await db.agentTask.deleteMany({ where: { companyId: { in: importedIds } } });
	await db.company.deleteMany({
		where: { domain: { in: [domain, secondDomain] } },
	});
}

afterAll(clean);

describe("importing companies", () => {
	it("normalizes domains and preserves the company creation lifecycle", async () => {
		await clean();
		events.length = 0;
		lifecycleIds.length = 0;
		fieldBackfillIds.length = 0;

		const result = await companies.import({
			rows: [
				{
					name: " Acme ",
					website: `https://www.${domain}/pricing`,
					industry: " Software ",
				},
				{ name: "Second", website: secondDomain },
			],
		});

		const stored = await db.company.findMany({
			where: { domain: { in: [domain, secondDomain] } },
			orderBy: { name: "asc" },
			select: {
				id: true,
				name: true,
				domain: true,
				website: true,
				industry: true,
				source: true,
				enrichmentStatus: true,
			},
		});
		importedIds.push(...stored.map((company) => company.id));
		const [first, second] = stored;
		if (!first || !second) {
			throw new Error("The import did not create two companies.");
		}

		expect(stored).toHaveLength(2);
		expect(result).toEqual({ created: 2, skipped: 0, skips: [] });
		expect(stored).toEqual([
			{
				id: first.id,
				name: "Acme",
				domain,
				website: `https://${domain}`,
				industry: "Software",
				source: "IMPORT",
				enrichmentStatus: "PENDING",
			},
			{
				id: second.id,
				name: "Second",
				domain: secondDomain,
				website: `https://${secondDomain}`,
				industry: null,
				source: "IMPORT",
				enrichmentStatus: "PENDING",
			},
		]);
		expect(events.map((event) => event.type)).toEqual([
			"company.created",
			"company.created",
		]);
		expect(lifecycleIds).toEqual([stored.map((company) => company.id)]);
		expect(fieldBackfillIds).toEqual([stored.map((company) => company.id)]);
	});

	it("skips blank, invalid, repeated, and existing company rows", async () => {
		const result = await companies.import({
			rows: [
				{ name: "", website: "blank.test" },
				{ name: "Invalid", website: "not a domain" },
				{ name: "Repeated", website: domain },
				{ name: "Repeated again", website: `https://${domain}` },
			],
		});

		expect(result).toEqual({
			created: 0,
			skipped: 4,
			skips: [
				{ row: 2, reason: "A company needs a name." },
				{ row: 3, reason: '"not a domain" is not a valid domain.' },
				{ row: 4, reason: `${domain} already belongs to a company.` },
				{ row: 5, reason: `${domain} already belongs to a company.` },
			],
		});
	});
});
