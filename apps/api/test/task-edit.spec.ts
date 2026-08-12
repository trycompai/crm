import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ActivitiesService } from "../src/activities/activities.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";

const suffix = process.env.TEST_RUN_ID ?? "task-edit-spec";
const userId = `user-${suffix}`;
const domain = `taskedit-${suffix}.test`;

const activities = new ActivitiesService(db, new ActivityStampService(db));

let companyId: string;

async function clean() {
	await db.activity.deleteMany({ where: { company: { domain } } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

async function newTask(subject: string, dueAt: string | null = null) {
	return activities.create({ type: "TASK", subject, companyId, dueAt }, userId);
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: {
			id: userId,
			name: "Task Rep",
			email: `${userId}@example.test`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `Task Co ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;
});

afterAll(clean);

describe("editing a task", () => {
	it("rewrites the subject and moves the due date", async () => {
		const task = await newTask("Call back", "2026-01-10");

		const updated = await activities.update({
			id: task.id,
			subject: "Call back after the demo",
			dueAt: "2026-02-01",
		});

		expect(updated.subject).toBe("Call back after the demo");
		expect(updated.dueAt).toBe("2026-02-01");
	});

	it("clears the due date", async () => {
		const task = await newTask("Send the deck", "2026-01-10");

		const updated = await activities.update({
			id: task.id,
			subject: "Send the deck",
			dueAt: null,
		});

		expect(updated.dueAt).toBeNull();
	});

	it("rejects an instant where a calendar day is required", async () => {
		await expect(
			newTask("Send the follow-up", "2026-08-11T14:00:00.000Z"),
		).rejects.toThrow("is not a calendar day");
	});

	it("leaves completion alone", async () => {
		const task = await newTask("Chase the invoice");
		const ticked = await activities.complete(task.id, true);

		const updated = await activities.update({
			id: task.id,
			subject: "Chase the invoice again",
			dueAt: null,
		});

		expect(updated.completedAt).toBe(ticked.completedAt);
	});

	it("refuses anything that is not a task", async () => {
		const note = await activities.create(
			{
				type: "NOTE",
				body: "They are switching CRM in the spring.",
				companyId,
			},
			userId,
		);

		await expect(
			activities.update({ id: note.id, subject: "Nope", dueAt: null }),
		).rejects.toThrow("Only tasks can be edited.");
	});

	it("404s an id that is not there", async () => {
		await expect(
			activities.update({
				id: "missing-activity",
				subject: "Nope",
				dueAt: null,
			}),
		).rejects.toThrow("No activity with id missing-activity.");
	});
});
