import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { createContact } from "../agent/lib/contacts";

const SUFFIX = "contacts-spec";
const USER_ID = "contacts-spec-user";
const SOURCE = {
	label: "SEC DEF 14A",
	url: "https://www.sec.gov/Archives/edgar/data/320193/0001308179-26-000008-index.html",
};

let companyId = "";

async function clear() {
	const companies = await db.company.findMany({
		where: { name: { contains: SUFFIX } },
		select: { id: true },
	});
	const ids = companies.map((company) => company.id);
	const contacts = await db.contact.findMany({
		where: {
			OR: [{ companyId: { in: ids } }, { lastName: { contains: SUFFIX } }],
		},
		select: { id: true },
	});
	const contactIds = contacts.map((contact) => contact.id);
	await db.activity.deleteMany({
		where: {
			OR: [{ companyId: { in: ids } }, { contactId: { in: contactIds } }],
		},
	});
	await db.agentTask.deleteMany({
		where: {
			OR: [{ companyId: { in: ids } }, { contactId: { in: contactIds } }],
		},
	});
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.company.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
	await clear();
	await db.user.upsert({
		where: { id: USER_ID },
		create: {
			id: USER_ID,
			name: "Contacts Spec",
			email: `${USER_ID}@example.test`,
		},
		update: {},
	});
	const company = await db.company.create({
		data: { name: `Apple ${SUFFIX}`, ownerId: USER_ID },
		select: { id: true },
	});
	companyId = company.id;
});

afterEach(async () => {
	await clear();
	await db.user.deleteMany({ where: { id: USER_ID } });
});

describe("createContact", () => {
	it("creates the contact, its event and its source note", async () => {
		const result = await createContact({
			firstName: "Tim",
			lastName: `Cook ${SUFFIX}`,
			title: "Chief Executive Officer",
			companyId,
			source: SOURCE,
		});

		expect(result.created).toBe(true);
		expect(result.companyId).toBe(companyId);

		const contact = await db.contact.findUnique({ where: { id: result.id } });
		expect(contact?.title).toBe("Chief Executive Officer");
		expect(contact?.ownerId).toBe(USER_ID);

		const task = await db.agentTask.findFirst({
			where: { contactId: result.id, kind: "agent-event" },
		});
		expect(task?.reason).toBe("contact.created");

		const activity = await db.activity.findFirst({
			where: { contactId: result.id },
		});
		expect(activity?.subject).toBe("Added from SEC DEF 14A");
		expect(activity?.body).toContain(SOURCE.url);
	});

	it("returns the existing contact by email, then by name on the same company", async () => {
		const first = await createContact({
			firstName: "Kate",
			lastName: `Adams ${SUFFIX}`,
			email: `Kate.Adams.${SUFFIX}@example.test`,
			companyId,
			source: SOURCE,
		});
		const byEmail = await createContact({
			firstName: "Katherine",
			lastName: `Adams ${SUFFIX}`,
			email: `kate.adams.${SUFFIX}@example.test`,
			companyId,
			source: SOURCE,
		});
		const byName = await createContact({
			firstName: "kate",
			lastName: `adams ${SUFFIX}`,
			companyId,
			source: SOURCE,
		});

		expect(byEmail.created).toBe(false);
		expect(byEmail.id).toBe(first.id);
		expect(byName.created).toBe(false);
		expect(byName.id).toBe(first.id);
		expect(await db.contact.count({ where: { companyId } })).toBe(1);
	});

	it("refuses a company that does not exist", async () => {
		const result = await createContact({
			firstName: "Nobody",
			lastName: SUFFIX,
			companyId: "missing-company",
			source: SOURCE,
		});
		expect(result.created).toBe(false);
		expect(result.reason).toContain("No such company");
	});
});
