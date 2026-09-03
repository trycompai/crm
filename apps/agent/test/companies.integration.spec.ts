import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { createCompany, LEI_FIELD_LABEL } from "../agent/lib/companies";

const SUFFIX = "companies-spec";
const SOURCE = {
	label: "GLEIF register",
	url: "https://search.gleif.org/#/record/W38RGI023J3WT1HWRP32",
};

const USER_ID = "companies-spec-user";

async function clear() {
	const companies = await db.company.findMany({
		where: { name: { contains: SUFFIX } },
		select: { id: true },
	});
	const ids = companies.map((company) => company.id);
	await db.activity.deleteMany({ where: { companyId: { in: ids } } });
	await db.agentTask.deleteMany({ where: { companyId: { in: ids } } });
	await db.fieldValue.deleteMany({ where: { companyId: { in: ids } } });
	await db.company.deleteMany({ where: { id: { in: ids } } });
	await db.fieldDefinition.deleteMany({
		where: { entity: "COMPANY", label: LEI_FIELD_LABEL },
	});
}

beforeEach(async () => {
	await clear();
	await db.user.upsert({
		where: { id: USER_ID },
		create: {
			id: USER_ID,
			name: "Companies Spec",
			email: `${USER_ID}@example.test`,
		},
		update: {},
	});
});

afterEach(async () => {
	await clear();
	await db.user.deleteMany({ where: { id: USER_ID } });
});

describe("createCompany", () => {
	it("creates the company, its event, its source note, its LEI and its enrichment", async () => {
		const result = await createCompany({
			name: `Siemens ${SUFFIX}`,
			website: "https://www.siemens.com/global/",
			countryCode: "de",
			country: "Germany",
			city: "Munich",
			lei: "W38RGI023J3WT1HWRP32",
			source: SOURCE,
		});

		expect(result.created).toBe(true);
		expect(result.domain).toBe("siemens.com");

		const company = await db.company.findUniqueOrThrow({
			where: { id: result.id },
			select: { countryCode: true, website: true, city: true },
		});
		expect(company.countryCode).toBe("DE");
		expect(company.website).toBe("https://siemens.com");
		expect(company.city).toBe("Munich");

		const tasks = await db.agentTask.findMany({
			where: { companyId: result.id },
			select: { kind: true, reason: true, payload: true },
		});
		expect(tasks.map((task) => task.kind).sort()).toEqual([
			"agent-event",
			"brand",
			"company-profile",
		]);
		const event = tasks.find((task) => task.kind === "agent-event");
		expect(event?.payload).toMatchObject({
			type: "company.created",
			record: { kind: "company", id: result.id },
		});

		const activity = await db.activity.findFirst({
			where: { companyId: result.id },
			select: { subject: true, body: true, meta: true },
		});
		expect(activity?.subject).toBe("Added from GLEIF register");
		expect(activity?.body).toContain(SOURCE.url);
		expect(activity?.meta).toMatchObject({ sourceUrl: SOURCE.url });

		const lei = await db.fieldValue.findFirst({
			where: { companyId: result.id, field: { label: LEI_FIELD_LABEL } },
			select: { text: true },
		});
		expect(lei?.text).toBe("W38RGI023J3WT1HWRP32");
	});

	it("returns the existing company instead of a duplicate", async () => {
		const first = await createCompany({
			name: `Renault ${SUFFIX}`,
			countryCode: "FR",
			source: SOURCE,
		});
		const second = await createCompany({
			name: `renault ${SUFFIX}`,
			countryCode: "fr",
			source: SOURCE,
		});

		expect(second.created).toBe(false);
		expect(second.id).toBe(first.id);
		expect(second.reason).toContain("already");

		expect(
			await db.company.count({
				where: { name: { contains: `Renault ${SUFFIX}` }, archivedAt: null },
			}),
		).toBe(1);
	});

	it("matches on domain before name", async () => {
		const first = await createCompany({
			name: `Acme ${SUFFIX}`,
			website: "acme-companies-spec.test",
			source: SOURCE,
		});
		const second = await createCompany({
			name: `Acme Holdings ${SUFFIX}`,
			website: "https://www.acme-companies-spec.test/about",
			source: SOURCE,
		});

		expect(second.created).toBe(false);
		expect(second.id).toBe(first.id);
	});
});
