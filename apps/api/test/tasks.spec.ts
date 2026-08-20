import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import { z } from "zod";
import { taskListInput } from "../src/activities/activities.contracts";
import { ActivitiesService } from "../src/activities/activities.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";

const suffix = process.env.TEST_RUN_ID ?? "tasks-spec";
const domain = `tasks-${suffix}.test`;
const userId = `user-${suffix}`;
const mateId = `mate-${suffix}`;

const activities = new ActivitiesService(db, new ActivityStampService(db));

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = "2026-08-12";

function input(overrides: Partial<z.input<typeof taskListInput>> = {}) {
	return taskListInput.parse({ q: `${suffix}`, today: TODAY, ...overrides });
}

let companyId: string;
let contactId: string;
let dealId: string;

async function clean() {
	const companies = await db.company.findMany({
		where: { domain },
		select: { id: true },
	});
	const companyIds = companies.map((row) => row.id);

	await db.activity.deleteMany({
		where: { OR: [{ companyId: { in: companyIds } }, { createdById: userId }] },
	});
	await db.deal.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.contact.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
	await db.user.deleteMany({ where: { id: { in: [userId, mateId] } } });
}

beforeAll(async () => {
	await clean();

	await db.user.createMany({
		data: [
			{ id: userId, name: "Test Rep", email: `${userId}@example.test` },
			{ id: mateId, name: "Other Rep", email: `${mateId}@example.test` },
		],
	});

	const company = await db.company.create({
		data: { name: `Tasks Co ${suffix}`, domain, ownerId: userId },
		select: { id: true },
	});
	companyId = company.id;

	const contact = await db.contact.create({
		data: {
			firstName: "Dated",
			lastName: "Person",
			email: `person@${domain}`,
			companyId,
			ownerId: userId,
		},
		select: { id: true },
	});
	contactId = contact.id;

	const deal = await db.deal.create({
		data: { name: `Tasks Deal ${suffix}`, companyId, ownerId: userId },
		select: { id: true },
	});
	dealId = deal.id;

	const startOfToday = new Date(`${TODAY}T00:00:00.000Z`);

	await db.activity.createMany({
		data: [
			{
				type: ActivityType.TASK,
				subject: `Chase the quote ${suffix}`,
				dueAt: new Date(startOfToday.getTime() - 3 * DAY_MS),
				companyId,
				dealId,
				createdById: userId,
			},
			{
				type: ActivityType.TASK,
				subject: `No due date ${suffix}`,
				contactId,
				companyId,
				createdById: userId,
			},
			{
				type: ActivityType.TASK,
				subject: `Later this week ${suffix}`,
				dueAt: new Date(startOfToday.getTime() + 2 * DAY_MS),
				companyId,
				createdById: mateId,
			},
			{
				type: ActivityType.TASK,
				subject: `Already handled ${suffix}`,
				dueAt: new Date(startOfToday.getTime() - 5 * DAY_MS),
				completedAt: new Date(),
				companyId,
				createdById: userId,
			},
			{
				type: ActivityType.NOTE,
				body: `Just a note ${suffix}`,
				companyId,
				createdById: userId,
			},
		],
	});
});

afterAll(clean);

describe("the tasks list", () => {
	it("returns tasks and never other activity", async () => {
		const result = await activities.tasks(input());

		expect(result.total).toBe(4);
		expect(result.rows.map((row) => row.subject)).not.toContain(
			`Just a note ${suffix}`,
		);
	});

	it("keeps a task with no due date, which the dashboard cannot show", async () => {
		const result = await activities.tasks(input({ due: ["none"] }));

		expect(result.rows.map((row) => row.subject)).toEqual([
			`No due date ${suffix}`,
		]);
	});

	it("ignores a due window it does not recognise", async () => {
		const [bogus, wrongCase] = await Promise.all([
			activities.tasks(input({ due: ["bogus"] })),
			activities.tasks(input({ due: ["OVERDUE"] })),
		]);

		expect(bogus.total).toBe(4);
		expect(wrongCase.total).toBe(4);
	});

	it("separates open from done", async () => {
		const [open, done] = await Promise.all([
			activities.tasks(input({ status: "open" })),
			activities.tasks(input({ status: "done" })),
		]);

		expect(open.total).toBe(3);
		expect(done.rows.map((row) => row.subject)).toEqual([
			`Already handled ${suffix}`,
		]);
	});

	it("counts every facet against the search, not the filters", async () => {
		const result = await activities.tasks(input({ status: "done" }));

		expect(result.facetCounts.status).toEqual({ open: 3, done: 1 });
		expect(result.facetCounts.due).toMatchObject({
			overdue: 2,
			today: 0,
			week: 1,
			none: 1,
		});
		expect(result.facetCounts.createdBy).toEqual({
			[userId]: 3,
			[mateId]: 1,
		});
	});

	it("filters by who added the task", async () => {
		const result = await activities.tasks(input({ createdBy: [mateId] }));

		expect(result.rows.map((row) => row.subject)).toEqual([
			`Later this week ${suffix}`,
		]);
	});

	it("sorts by due date with the undated last", async () => {
		const result = await activities.tasks(input({ sort: "dueAt", dir: "asc" }));

		expect(result.rows.at(-1)?.subject).toBe(`No due date ${suffix}`);
		expect(result.rows[0]?.subject).toBe(`Already handled ${suffix}`);
	});

	it("carries the record a task hangs off", async () => {
		const result = await activities.tasks(input({ due: ["none"] }));
		const task = result.rows[0];

		expect(task?.contact?.id).toBe(contactId);
		expect(task?.company?.id).toBe(companyId);
		expect(task?.deal).toBeNull();
	});

	it("paginates", async () => {
		const result = await activities.tasks(input({ pageSize: 2, page: 2 }));

		expect(result.total).toBe(4);
		expect(result.rows).toHaveLength(2);
	});
});
