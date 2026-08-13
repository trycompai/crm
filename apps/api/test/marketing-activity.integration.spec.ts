import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { MarketingActivityService } from "../src/marketing/marketing-activity.service";

const TAG = `mktactivity${Date.now()}`;

const activity = new MarketingActivityService(db);
const stamp = new ActivityStampService(db);

let ownedId: string;
let unownedId: string;
let companyId: string;
let ownerId: string;
let quietAt: Date;

async function clean() {
	await db.activity.deleteMany({ where: { contact: { lastName: TAG } } });
	await db.contact.deleteMany({ where: { lastName: TAG } });
	await db.company.deleteMany({ where: { name: TAG } });
	await db.user.deleteMany({ where: { email: `${TAG}@example.test` } });
}

beforeAll(async () => {
	await clean();

	const owner = await db.user.create({
		data: {
			id: `user-${TAG}`,
			name: "Owner",
			email: `${TAG}@example.test`,
			updatedAt: new Date(),
		},
		select: { id: true },
	});

	quietAt = new Date(Date.now() - 90 * 86_400_000);
	ownerId = owner.id;

	const company = await db.company.create({
		data: { name: TAG, lastActivityAt: quietAt },
		select: { id: true },
	});

	const [owned, unowned] = await Promise.all([
		db.contact.create({
			data: {
				firstName: "Owned",
				lastName: TAG,
				email: `owned.${TAG}@example.test`,
				ownerId: owner.id,
				companyId: company.id,
				lastActivityAt: quietAt,
			},
			select: { id: true },
		}),
		db.contact.create({
			data: {
				firstName: "Unowned",
				lastName: TAG,
				email: `unowned.${TAG}@example.test`,
				lastActivityAt: quietAt,
			},
			select: { id: true },
		}),
	]);

	ownedId = owned.id;
	unownedId = unowned.id;
	companyId = company.id;
});

afterAll(clean);

describe("a marketing send on the timeline", () => {
	it("files one row per send, against the contact's owner", async () => {
		const written = await activity.file([
			{
				contactId: ownedId,
				subject: "Screenshot duty is cancelled",
				campaignName: "Bi-weekly changelog",
				sentAt: new Date(),
			},
		]);

		expect(written).toBe(1);

		const row = await db.activity.findFirstOrThrow({
			where: { contactId: ownedId },
			select: { type: true, subject: true, body: true, meta: true },
		});

		expect(row.type).toBe("EMAIL");
		expect(row.subject).toBe("Screenshot duty is cancelled");
		expect(row.body).toBe("Bi-weekly changelog");
		expect(row.meta).toMatchObject({ automated: true, source: "marketing" });
	});

	it("never bumps lastActivityAt, so a quiet contact stays quiet", async () => {
		await activity.file([
			{
				contactId: ownedId,
				subject: "Another one",
				campaignName: null,
				sentAt: new Date(),
			},
		]);

		const contact = await db.contact.findUniqueOrThrow({
			where: { id: ownedId },
			select: { lastActivityAt: true },
		});

		expect(contact.lastActivityAt?.getTime()).toBe(quietAt.getTime());
	});

	it("stays out of a recompute, so a rebuild keeps the quiet window", async () => {
		await db.activity.create({
			data: {
				type: "CALL",
				subject: "The one a person made",
				contactId: ownedId,
				companyId,
				createdById: ownerId,
				createdAt: quietAt,
			},
		});

		await activity.file([
			{
				contactId: ownedId,
				subject: "A campaign, today",
				campaignName: null,
				sentAt: new Date(),
			},
		]);

		await stamp.recomputeAll();

		const [contact, company] = await Promise.all([
			db.contact.findUniqueOrThrow({
				where: { id: ownedId },
				select: { lastActivityAt: true },
			}),
			db.company.findUniqueOrThrow({
				where: { id: companyId },
				select: { lastActivityAt: true },
			}),
		]);

		expect(contact.lastActivityAt?.getTime()).toBe(quietAt.getTime());
		expect(company.lastActivityAt?.getTime()).toBe(quietAt.getTime());
	});

	it("stays out of a scoped restamp too", async () => {
		await stamp.recomputeMany({
			companyIds: [companyId],
			contactIds: [ownedId],
			dealIds: [],
		});

		const contact = await db.contact.findUniqueOrThrow({
			where: { id: ownedId },
			select: { lastActivityAt: true },
		});

		expect(contact.lastActivityAt?.getTime()).toBe(quietAt.getTime());
	});

	it("still files for a contact nobody owns", async () => {
		const written = await activity.file([
			{
				contactId: unownedId,
				subject: null,
				campaignName: null,
				sentAt: new Date(),
			},
		]);

		expect(written).toBe(1);

		const row = await db.activity.findFirstOrThrow({
			where: { contactId: unownedId },
			select: { subject: true },
		});

		expect(row.subject).toBe("A marketing email");
	});

	it("writes nothing when there is nothing to write", async () => {
		expect(await activity.file([])).toBe(0);
	});
});
