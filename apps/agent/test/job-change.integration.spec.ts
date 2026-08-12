import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import type { Evidence } from "../agent/lib/evidence";
import { recordFact, lastEmployerChange } from "../agent/lib/facts";
import { raiseJobChange } from "../agent/lib/job-change";

const suffix = process.env.TEST_RUN_ID ?? "job-change-spec";
const email = `job.change.${suffix}@example.test`;
const ownerEmail = `owner.job.${suffix}@example.test`;

let contactId: string;
let ownerId: string;
let companyId: string;
let otherCompanyId: string;

const seen = (kind: Evidence["kind"], detail = "observed"): Evidence => ({
	kind,
	detail,
});

async function cleanup() {
	await db.activity.deleteMany({
		where: {
			OR: [
				{ contact: { email } },
				{ createdBy: { email: ownerEmail } },
			],
		},
	});
	await db.contactFact.deleteMany({ where: { contact: { email } } });
	await db.contact.deleteMany({ where: { email } });
	await db.company.deleteMany({
		where: { domain: { in: [`old-${suffix}.test`, `new-${suffix}.test`] } },
	});
	await db.user.deleteMany({ where: { email: ownerEmail } });
}

beforeAll(async () => {
	await cleanup();

	const owner = await db.user.create({
		data: {
			id: `owner-${suffix}`,
			name: "Owner Rep",
			email: ownerEmail,
			emailVerified: true,
		},
		select: { id: true },
	});
	ownerId = owner.id;

	const oldCompany = await db.company.create({
		data: { name: `Old Co ${suffix}`, domain: `old-${suffix}.test` },
		select: { id: true },
	});
	companyId = oldCompany.id;

	const newCompany = await db.company.create({
		data: { name: `New Co ${suffix}`, domain: `new-${suffix}.test` },
		select: { id: true },
	});
	otherCompanyId = newCompany.id;

	const contact = await db.contact.create({
		data: {
			firstName: "Champion",
			lastName: "Mover",
			email,
			companyId,
			ownerId,
		},
		select: { id: true },
	});
	contactId = contact.id;

	await recordFact({
		contactId,
		field: "employer",
		value: "Fleetio",
		evidence: [seen("linkedin.employer-and-name")],
		method: "linkedin.profile",
		sourceUrl: "https://www.linkedin.com/in/champion-mover",
	});
	await recordFact({
		contactId,
		field: "employer",
		value: "Comp AI",
		evidence: [seen("linkedin.employer-and-name")],
		method: "linkedin.profile",
		sourceUrl: "https://www.linkedin.com/in/champion-mover",
	});
});

afterAll(cleanup);

describe("lastEmployerChange", () => {
	it("reads the superseding employer pair", async () => {
		const change = await lastEmployerChange(contactId);
		expect(change).toMatchObject({
			from: "Fleetio",
			to: "Comp AI",
			sourceUrl: "https://www.linkedin.com/in/champion-mover",
		});
	});
});

describe("raiseJobChange", () => {
	it("writes a note and an owner TASK without moving the company", async () => {
		const result = await raiseJobChange({ contactId });

		expect(result).toMatchObject({
			raised: true,
			from: "Fleetio",
			to: "Comp AI",
			moved: false,
			ownerNotified: true,
		});
		if (!result.raised) return;

		expect(result.noteId).toBeTruthy();
		expect(result.taskId).toBeTruthy();

		const note = await db.activity.findUnique({
			where: { id: result.noteId! },
			select: {
				type: true,
				subject: true,
				createdById: true,
				contactId: true,
				meta: true,
			},
		});
		expect(note).toMatchObject({
			type: ActivityType.NOTE,
			subject: "Champion Mover has moved to Comp AI",
			createdById: ownerId,
			contactId,
		});
		expect(note?.meta).toMatchObject({
			source: "job-change",
			from: "Fleetio",
			to: "Comp AI",
		});

		const task = await db.activity.findUnique({
			where: { id: result.taskId! },
			select: {
				type: true,
				subject: true,
				createdById: true,
				dueAt: true,
				completedAt: true,
				meta: true,
			},
		});
		expect(task).toMatchObject({
			type: ActivityType.TASK,
			subject: "Champion Mover has moved to Comp AI",
			createdById: ownerId,
			completedAt: null,
		});
		expect(task?.dueAt).toBeInstanceOf(Date);
		expect(task?.meta).toMatchObject({ source: "job-change" });

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { companyId: true },
		});
		expect(contact?.companyId).toBe(companyId);
	});

	it("re-parents only when moveToCompanyId is given after approval", async () => {
		const result = await raiseJobChange({
			contactId,
			moveToCompanyId: otherCompanyId,
		});

		expect(result).toMatchObject({
			raised: true,
			moved: true,
			ownerNotified: true,
		});

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { companyId: true },
		});
		expect(contact?.companyId).toBe(otherCompanyId);
	});

	it("refuses when there is no employer supersession", async () => {
		const lonely = await db.contact.create({
			data: {
				firstName: "Still",
				lastName: "Here",
				email: `still.here.${suffix}@example.test`,
				ownerId,
			},
			select: { id: true },
		});

		await recordFact({
			contactId: lonely.id,
			field: "employer",
			value: "Same Co",
			evidence: [seen("linkedin.employer-and-name")],
			method: "linkedin.profile",
		});

		const result = await raiseJobChange({ contactId: lonely.id });
		expect(result).toEqual({
			raised: false,
			reason: "No employer change on the facts for this contact.",
		});

		await db.contactFact.deleteMany({ where: { contactId: lonely.id } });
		await db.contact.delete({ where: { id: lonely.id } });
	});

	it("reports ownerNotified false when the contact has no owner", async () => {
		const orphan = await db.contact.create({
			data: {
				firstName: "No",
				lastName: "Owner",
				email: `no.owner.${suffix}@example.test`,
			},
			select: { id: true },
		});

		await recordFact({
			contactId: orphan.id,
			field: "employer",
			value: "Alpha",
			evidence: [seen("linkedin.employer-and-name")],
			method: "linkedin.profile",
		});
		await recordFact({
			contactId: orphan.id,
			field: "employer",
			value: "Beta",
			evidence: [seen("linkedin.employer-and-name")],
			method: "linkedin.profile",
		});

		const result = await raiseJobChange({ contactId: orphan.id });
		expect(result).toMatchObject({
			raised: true,
			ownerNotified: false,
			taskId: null,
		});
		if (result.raised) {
			expect(result.noteId).toBeTruthy();
		}

		await db.activity.deleteMany({ where: { contactId: orphan.id } });
		await db.contactFact.deleteMany({ where: { contactId: orphan.id } });
		await db.contact.delete({ where: { id: orphan.id } });
	});
});
