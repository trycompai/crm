import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { InboundService } from "../src/inbound/inbound.service";

const suffix = `granola-review-${crypto.randomUUID()}`;
const userId = `user-${suffix}`;
const domain = `${suffix}.example.test`;
const externalId = `note-${suffix}`;
const excludedExternalId = `excluded-${suffix}`;
const raceExternalId = `race-${suffix}`;
const raceTitle = `Concurrent review ${suffix}`;
const agent = {
	syncInbound: async () => ({ configured: 0, queued: 0 }),
} as unknown as AgentTriggerService;
const inbound = new InboundService(db, agent);

let companyId: string;
let contactId: string;
let dealId: string;
let activityId: string;
let noteId: string;
let excludedNoteId: string;

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Granola Reviewer",
			email: `${userId}@example.test`,
		},
	});
	const company = await db.company.create({
		data: { name: "Granola Review Company", domain },
		select: { id: true },
	});
	companyId = company.id;
	const contact = await db.contact.create({
		data: {
			firstName: "Casey",
			email: `casey@${domain}`,
			companyId,
		},
		select: { id: true },
	});
	contactId = contact.id;
	const deal = await db.deal.create({
		data: {
			name: "Granola Review Deal",
			companyId,
			ownerId: userId,
		},
		select: { id: true },
	});
	dealId = deal.id;
	const activity = await db.activity.create({
		data: {
			type: "MEETING",
			subject: "Unmatched review call",
			occurredAt: new Date(),
			createdById: userId,
		},
		select: { id: true },
	});
	activityId = activity.id;
	const note = await db.granolaNote.create({
		data: {
			externalId,
			title: "Unmatched review call",
			attendees: [{ name: "Casey", email: `casey@${domain}` }],
			folders: [],
			sourceCreatedAt: new Date(),
			sourceUpdatedAt: new Date(),
			activityId,
		},
		select: { id: true },
	});
	noteId = note.id;
	const excluded = await db.granolaNote.create({
		data: {
			externalId: excludedExternalId,
			title: "Personal note",
			attendees: [],
			folders: [],
			sourceCreatedAt: new Date(),
			sourceUpdatedAt: new Date(),
		},
		select: { id: true },
	});
	excludedNoteId = excluded.id;
});

afterAll(async () => {
	await db.granolaNote.deleteMany({
		where: {
			externalId: { in: [externalId, excludedExternalId, raceExternalId] },
		},
	});
	await db.granolaNoteExclusion.deleteMany({
		where: { externalId: { in: [externalId, excludedExternalId] } },
	});
	await db.activity.deleteMany({
		where: { OR: [{ id: activityId }, { subject: raceTitle }] },
	});
	await db.deal.deleteMany({ where: { id: dealId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("Granola review", () => {
	it("shows unmatched notes and attaches a reviewed call to CRM records", async () => {
		const review = await inbound.granolaReview();
		expect(review.notes.some((note) => note.id === noteId)).toBe(true);

		await inbound.matchGranola(
			{ id: noteId, companyId, contactId, dealId },
			userId,
		);

		const [note, activity] = await Promise.all([
			db.granolaNote.findUnique({ where: { id: noteId } }),
			db.activity.findUnique({ where: { id: activityId } }),
		]);
		expect(note?.companyId).toBe(companyId);
		expect(note?.contactId).toBe(contactId);
		expect(note?.dealId).toBe(dealId);
		expect(activity?.companyId).toBe(companyId);
		expect(activity?.contactId).toBe(contactId);
		expect(activity?.dealId).toBe(dealId);
	});

	it("creates one activity when reviewers match the same note concurrently", async () => {
		const note = await db.granolaNote.create({
			data: {
				externalId: raceExternalId,
				title: raceTitle,
				attendees: [{ name: "Casey", email: `casey@${domain}` }],
				folders: [],
				sourceCreatedAt: new Date(),
				sourceUpdatedAt: new Date(),
			},
			select: { id: true },
		});

		await Promise.all(
			Array.from({ length: 8 }, () =>
				inbound.matchGranola(
					{ id: note.id, companyId, contactId, dealId },
					userId,
				),
			),
		);

		const [matched, activities] = await Promise.all([
			db.granolaNote.findUnique({
				where: { id: note.id },
				select: { activityId: true },
			}),
			db.activity.findMany({
				where: { subject: raceTitle, createdById: userId },
				select: { id: true },
			}),
		]);

		expect(activities).toHaveLength(1);
		expect(matched?.activityId).toBe(activities[0]?.id);
	});

	it("removes an irrelevant note and suppresses its Granola ID", async () => {
		await inbound.excludeGranola({
			id: excludedNoteId,
			reason: "Personal note",
		});

		expect(
			await db.granolaNote.findUnique({ where: { id: excludedNoteId } }),
		).toBeNull();
		expect(
			await db.granolaNoteExclusion.findUnique({
				where: { externalId: excludedExternalId },
			}),
		).not.toBeNull();
	});
});
