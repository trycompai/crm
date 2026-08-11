import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, EnrichmentStatus } from "@crm/db";
import { markRunning, settle } from "../agent/lib/enrichment";
import { claimDue } from "../agent/lib/tasks";

const domain = "lifecycle.example.test";
const taskKind = "test-enrichment-lease";

async function clear() {
	await db.agentTask.deleteMany({ where: { kind: taskKind } });
	await db.company.deleteMany({ where: { domain } });
	await db.contact.deleteMany({
		where: { email: { startsWith: "lifecycle-" } },
	});
}

beforeEach(clear);
afterEach(clear);

async function company() {
	return db.company.create({
		data: { name: "Lifecycle", domain },
		select: { id: true },
	});
}

async function contact() {
	return db.contact.create({
		data: {
			firstName: "Lifecycle",
			email: `lifecycle-${crypto.randomUUID()}@example.test`,
		},
		select: { id: true },
	});
}

function subjectOf(ids: { contactId?: string; companyId?: string }) {
	return {
		id: "task",
		kind: "test",
		contactId: ids.contactId ?? null,
		companyId: ids.companyId ?? null,
	};
}

async function statusOfContact(id: string) {
	const row = await db.contact.findUnique({
		where: { id },
		select: { enrichmentStatus: true, enrichedAt: true },
	});
	return row;
}

async function leaseContact(contactId: string) {
	const task = await db.agentTask.create({
		data: {
			kind: taskKind,
			reason: "lease guard test",
			dueAt: new Date(Date.now() - 1000),
			contactId,
		},
		select: { id: true },
	});
	const leased = (await claimDue(1, { only: [taskKind] }))[0];
	if (!leased || leased.id !== task.id) throw new Error("Task was not leased.");
	return leased;
}

describe("the record follows the task", () => {
	it("takes a contact off PENDING, which nothing used to do", async () => {
		const person = await contact();
		const subject = subjectOf({ contactId: person.id });

		expect((await statusOfContact(person.id))?.enrichmentStatus).toBe(
			"PENDING",
		);

		await markRunning(subject);
		expect((await statusOfContact(person.id))?.enrichmentStatus).toBe(
			"RUNNING",
		);

		await settle(subject, EnrichmentStatus.COMPLETE);
		const done = await statusOfContact(person.id);
		expect(done?.enrichmentStatus).toBe("COMPLETE");
		expect(done?.enrichedAt).not.toBeNull();
	});

	it("does the same for a company", async () => {
		const org = await company();
		const subject = subjectOf({ companyId: org.id });

		await markRunning(subject);
		await settle(subject, EnrichmentStatus.COMPLETE);

		const row = await db.company.findUnique({
			where: { id: org.id },
			select: { enrichmentStatus: true },
		});
		expect(row?.enrichmentStatus).toBe("COMPLETE");
	});

	it("lets a tool's more specific answer win over the queue's", async () => {
		const org = await company();
		const subject = subjectOf({ companyId: org.id });

		await markRunning(subject);

		await db.company.update({
			where: { id: org.id },
			data: {
				enrichmentStatus: EnrichmentStatus.SKIPPED,
				enrichmentError: "No domain to look up.",
			},
		});

		await settle(subject, EnrichmentStatus.COMPLETE);

		const row = await db.company.findUnique({
			where: { id: org.id },
			select: { enrichmentStatus: true, enrichmentError: true },
		});
		expect(row?.enrichmentStatus).toBe("SKIPPED");
		expect(row?.enrichmentError).toBe("No domain to look up.");
	});

	it("puts a failed record back to work on a retry", async () => {
		const person = await contact();
		const subject = subjectOf({ contactId: person.id });

		await markRunning(subject);
		await settle(subject, EnrichmentStatus.FAILED, "the vendor refused");
		expect((await statusOfContact(person.id))?.enrichmentStatus).toBe("FAILED");

		await markRunning(subject);
		const retried = await statusOfContact(person.id);
		expect(retried?.enrichmentStatus).toBe("RUNNING");

		const row = await db.contact.findUnique({
			where: { id: person.id },
			select: { enrichmentError: true },
		});
		expect(row?.enrichmentError).toBeNull();
	});

	it("survives a record deleted while the agent was still reading about it", async () => {
		const person = await contact();
		const subject = subjectOf({ contactId: person.id });

		await markRunning(subject);
		await db.contact.delete({ where: { id: person.id } });

		await settle(subject, EnrichmentStatus.COMPLETE);
	});

	it("does not mark a record running after its task moves to approval", async () => {
		const person = await contact();
		const task = await leaseContact(person.id);
		await db.agentTask.update({
			where: { id: task.id },
			data: { state: "WAITING_FOR_APPROVAL", leasedUntil: null },
		});

		expect(
			await markRunning(subjectOf({ contactId: person.id }), {
				taskId: task.id,
				expectedAttempt: task.attempts,
				contactId: person.id,
			}),
		).toBe(false);
		expect((await statusOfContact(person.id))?.enrichmentStatus).toBe(
			EnrichmentStatus.PENDING,
		);
	});

	it("does not let an expired worker mark a later lease running", async () => {
		const person = await contact();
		const first = await leaseContact(person.id);
		await db.agentTask.update({
			where: { id: first.id },
			data: { leasedUntil: new Date(Date.now() - 1000) },
		});
		const second = (await claimDue(1, { only: [taskKind] }))[0];

		expect(
			await markRunning(subjectOf({ contactId: person.id }), {
				taskId: first.id,
				expectedAttempt: first.attempts,
				contactId: person.id,
			}),
		).toBe(false);
		expect((await statusOfContact(person.id))?.enrichmentStatus).toBe(
			EnrichmentStatus.PENDING,
		);
		expect(
			await markRunning(subjectOf({ contactId: person.id }), {
				taskId: second?.id ?? "",
				expectedAttempt: second?.attempts ?? 0,
				contactId: person.id,
			}),
		).toBe(true);
		expect((await statusOfContact(person.id))?.enrichmentStatus).toBe(
			EnrichmentStatus.RUNNING,
		);
	});
});
