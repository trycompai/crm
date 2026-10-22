import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import { ActivitiesService } from "../src/activities/activities.service";
import {
	serializeTaskDueDay,
	taskDayBoundaries,
} from "../src/activities/task-due-date";
import { ActivityStampService } from "../src/crm/activity-stamp.service";

const suffix = process.env.TEST_RUN_ID ?? "tasks-spec";
const userId = `tasks-user-${suffix}`;
const domain = `tasks-${suffix}.test`;
const stamp = new ActivityStampService(db);
const activities = new ActivitiesService(db, stamp);
let companyId: string;

async function clean() {
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Task Owner", email: `owner@${domain}` },
	});
	const company = await db.company.create({
		data: { name: "Task Company", domain },
		select: { id: true },
	});
	companyId = company.id;

	const { startOfToday } = taskDayBoundaries(new Date());
	const yesterday = new Date(startOfToday.getTime() - 86_400_000);
	await db.activity.createMany({
		data: [
			{
				type: ActivityType.TASK,
				subject: "Ship 100% complete",
				dueAt: startOfToday,
				companyId,
				createdById: userId,
			},
			{
				type: ActivityType.TASK,
				subject: "Past task",
				dueAt: yesterday,
				companyId,
				createdById: userId,
			},
			{
				type: ActivityType.TASK,
				subject: "No date task",
				companyId,
				createdById: userId,
			},
			{
				type: ActivityType.TASK,
				subject: "Done task",
				completedAt: new Date(),
				companyId,
				createdById: userId,
			},
		],
	});
});

afterAll(clean);

const baseInput = {
	q: "",
	sort: "dueAt",
	dir: "asc" as const,
	page: 1,
	pageSize: 25,
	status: "all" as const,
	due: [],
	createdBy: [],
};

describe("task list", () => {
	it("returns related records and complete facet totals", async () => {
		const result = await activities.tasks(baseInput);

		expect(result.total).toBe(4);
		expect(result.rows[0]?.company?.name).toBe("Task Company");
		expect(result.facetCounts.status).toEqual({ open: 3, done: 1 });
		expect(result.facetCounts.due).toMatchObject({
			overdue: 1,
			today: 1,
			none: 2,
		});
		expect(result.day.today).toBe(
			serializeTaskDueDay(taskDayBoundaries(new Date()).startOfToday) ?? "",
		);
	});

	it("searches task subjects", async () => {
		const result = await activities.tasks({ ...baseInput, q: "100" });

		expect(result.total).toBe(1);
		expect(result.rows[0]?.subject).toBe("Ship 100% complete");
	});

	it("combines status, due, and creator filters", async () => {
		const result = await activities.tasks({
			...baseInput,
			status: "open",
			due: ["overdue"],
			createdBy: [userId],
		});

		expect(result.total).toBe(1);
		expect(result.rows[0]?.subject).toBe("Past task");
	});
});

describe("task editing", () => {
	it("updates a task with a calendar day", async () => {
		const task = await db.activity.findFirstOrThrow({
			where: { createdById: userId, subject: "No date task" },
			select: { id: true },
		});

		const updated = await activities.update({
			id: task.id,
			subject: "Dated task",
			dueAt: "2026-12-03",
		});

		expect(updated.subject).toBe("Dated task");
		expect(updated.dueAt).toBe("2026-12-03T00:00:00.000Z");
	});
});
