import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompaniesService } from "../src/companies/companies.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import type { FaviconService } from "../src/companies/favicon.service";
import { ContactsService } from "../src/contacts/contacts.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "bulk-spec";
const domain = `bulk-${suffix}.test`;
const ownerId = `owner-${suffix}`;
const secondOwnerId = `second-owner-${suffix}`;
const ours = { OR: [{ email: { endsWith: `@${domain}` } }] };

const agent = {
	contactCreated: async () => undefined,
	companyCreated: async () => undefined,
	companyRequested: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const queue = new AgentQueueService(db);
const conversion = new ConversionService(db);
const directory = new CompanyDirectoryService(agent);

const fields = new FieldsService(db, agent);
const contacts = new ContactsService(
	db,
	directory,
	agent,
	queue,
	stamp,
	fields,
);
const companies = new CompaniesService(
	db,
	agent,
	queue,
	{ backfill: async () => undefined } as unknown as FaviconService,
	stamp,
	conversion,
	fields,
);
const deals = new DealsService(db, agent, stamp, conversion, fields);

let companyId: string;

async function clean() {
	const owned = await db.company.findMany({
		where: { domain: { endsWith: domain } },
		select: { id: true },
	});
	const companyIds = owned.map((row) => row.id);

	await db.deal.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.activity.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.agentTask.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.contact.deleteMany({ where: ours });
	await db.suppressedContact.deleteMany({ where: ours });
	await db.company.deleteMany({ where: { domain: { endsWith: domain } } });
	await db.user.deleteMany({ where: { id: { in: [ownerId, secondOwnerId] } } });
}

beforeAll(async () => {
	await clean();

	await db.user.createMany({
		data: [
			{ id: ownerId, name: "First Rep", email: `first@${domain}` },
			{ id: secondOwnerId, name: "Second Rep", email: `second@${domain}` },
		],
	});

	const company = await db.company.create({
		data: { name: `Bulk Co ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;
});

afterAll(clean);

describe("assigning an owner to a selection", () => {
	it("moves every record it was given", async () => {
		const first = await contacts.create({
			firstName: "Ada",
			email: `ada@${domain}`,
			ownerId,
		});
		const second = await contacts.create({
			firstName: "Grace",
			email: `grace@${domain}`,
			ownerId,
		});

		expect(
			await contacts.bulkAssignOwner({
				ids: [first.id, second.id],
				ownerId: secondOwnerId,
			}),
		).toEqual({ requested: 2, succeeded: 2, failed: 0, message: null });

		expect(
			await db.contact.count({
				where: { id: { in: [first.id, second.id] }, ownerId: secondOwnerId },
			}),
		).toBe(2);
	});

	it("counts the same record once, however many times it was sent", async () => {
		const only = await contacts.create({
			firstName: "Edsger",
			email: `edsger@${domain}`,
		});

		expect(
			await contacts.bulkAssignOwner({
				ids: [only.id, only.id],
				ownerId,
			}),
		).toEqual({ requested: 1, succeeded: 1, failed: 0, message: null });
	});

	it("refuses an owner who does not work here", async () => {
		const contact = await contacts.create({
			firstName: "Alan",
			email: `alan@${domain}`,
		});

		await expect(
			contacts.bulkAssignOwner({
				ids: [contact.id],
				ownerId: `nobody-${suffix}`,
			}),
		).rejects.toThrow(/does not work here/);

		expect(
			await db.contact.findUnique({
				where: { id: contact.id },
				select: { ownerId: true },
			}),
		).toEqual({ ownerId: null });
	});
});

describe("deleting a selection", () => {
	it("suppresses every address, exactly as deleting them one by one would", async () => {
		const first = await contacts.create({
			firstName: "Gone",
			email: `gone@${domain}`,
		});
		const second = await contacts.create({
			firstName: "Also Gone",
			email: `also-gone@${domain}`,
		});

		expect(await contacts.bulkDelete([first.id, second.id])).toEqual({
			requested: 2,
			succeeded: 2,
			failed: 0,
			message: null,
		});

		expect(
			await db.suppressedContact.count({
				where: { email: { in: [`gone@${domain}`, `also-gone@${domain}`] } },
			}),
		).toBe(2);
	});

	it("finishes the rest and says what it could not do", async () => {
		const survivor = await contacts.create({
			firstName: "Doomed",
			email: `doomed@${domain}`,
		});

		const result = await contacts.bulkDelete([
			survivor.id,
			`missing-${suffix}`,
		]);

		expect(result.succeeded).toBe(1);
		expect(result.failed).toBe(1);
		expect(result.message).toMatch(/No contact with id/);
		expect(
			await db.contact.findUnique({ where: { id: survivor.id } }),
		).toBeNull();
	});

	it("takes a company's deals with it", async () => {
		const doomed = await companies.create({
			name: `Doomed Co ${suffix}`,
			domain: `doomed-${domain}`,
		});
		const deal = await deals.create({
			name: `Doomed deal ${suffix}`,
			companyId: doomed.id,
			ownerId,
		});

		expect(await companies.bulkDelete([doomed.id])).toEqual({
			requested: 1,
			succeeded: 1,
			failed: 0,
			message: null,
		});

		expect(await db.deal.findUnique({ where: { id: deal.id } })).toBeNull();
	});
});

describe("moving a selection of deals to a stage", () => {
	it("will not close them as lost without a reason", async () => {
		const deal = await deals.create({
			name: `Unreasoned ${suffix}`,
			companyId,
			ownerId,
		});

		await expect(
			deals.bulkSetStage({ ids: [deal.id], stage: "CLOSED_LOST" }, ownerId),
		).rejects.toThrow(/teaches nobody anything/);

		expect(
			await db.deal.findUnique({
				where: { id: deal.id },
				select: { stage: true },
			}),
		).toEqual({ stage: "DEMO_BOOKED" });
	});

	it("writes the one reason onto every deal's timeline", async () => {
		const first = await deals.create({
			name: `Lost one ${suffix}`,
			companyId,
			ownerId,
		});
		const second = await deals.create({
			name: `Lost two ${suffix}`,
			companyId,
			ownerId,
		});

		expect(
			await deals.bulkSetStage(
				{
					ids: [first.id, second.id],
					stage: "CLOSED_LOST",
					closedReason: "Budget pulled",
				},
				ownerId,
			),
		).toEqual({ requested: 2, succeeded: 2, failed: 0, message: null });

		const closed = await db.deal.findMany({
			where: { id: { in: [first.id, second.id] } },
			select: { stage: true, closedReason: true, closedAt: true },
		});

		expect(closed.every((deal) => deal.stage === "CLOSED_LOST")).toBe(true);
		expect(closed.every((deal) => deal.closedReason === "Budget pulled")).toBe(
			true,
		);
		expect(closed.every((deal) => deal.closedAt !== null)).toBe(true);

		expect(
			await db.activity.count({
				where: {
					dealId: { in: [first.id, second.id] },
					type: "STAGE_CHANGE",
					body: "Budget pulled",
				},
			}),
		).toBe(2);
	});
});
