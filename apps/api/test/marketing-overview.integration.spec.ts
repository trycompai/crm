import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { MARKETING } from "@crm/db/marketing";
import { MarketingCampaignsService } from "../src/marketing/marketing-campaigns.service";
import type { MarketingTemplatesService } from "../src/marketing/marketing-templates.service";
import type { ResendService } from "../src/marketing/resend.service";

const TAG = `overview${Date.now()}`;
const ADDRESS = `${TAG}@example.test`;
const DAY_MS = 86_400_000;
const OUTSIDE_MS = MARKETING.overview.windowMs + DAY_MS;

const resend = {} as unknown as ResendService;
const templates = {} as unknown as MarketingTemplatesService;

const campaigns = new MarketingCampaignsService(db, resend, templates);

let recipientId: string;

async function clean() {
	await db.marketingSend.deleteMany({
		where: { recipient: { address: ADDRESS } },
	});
	await db.marketingRecipient.deleteMany({ where: { address: ADDRESS } });
	await db.marketingCampaign.deleteMany({ where: { name: { contains: TAG } } });
}

async function campaign(status: "ACTIVE" | "SENDING" | "SCHEDULED") {
	await db.marketingCampaign.create({
		data: {
			name: `${TAG} ${status}`,
			kind: "DRIP",
			status,
			nodes: { create: [{ kind: "EMAIL", subject: "Hello", x: 0, y: 0 }] },
		},
		select: { id: true },
	});
}

beforeAll(async () => {
	await clean();

	const recipient = await db.marketingRecipient.create({
		data: { address: ADDRESS },
		select: { id: true },
	});

	recipientId = recipient.id;
});

afterAll(clean);

describe("what the marketing overview counts", () => {
	it("counts a campaign that is running, and leaves a scheduled one out", async () => {
		const before = await campaigns.overview();

		await campaign("ACTIVE");
		await campaign("SENDING");
		await campaign("SCHEDULED");

		const after = await campaigns.overview();

		expect(after.live - before.live).toBe(2);
	});

	it("counts a send by when it went out, not by when it was queued", async () => {
		const before = await campaigns.overview();
		const now = Date.now();

		await db.marketingSend.createMany({
			data: [
				{
					recipientId,
					pass: 1,
					status: "SENT",
					dueAt: new Date(now - OUTSIDE_MS),
					createdAt: new Date(now - OUTSIDE_MS),
					sentAt: new Date(now - DAY_MS),
				},
				{
					recipientId,
					pass: 2,
					status: "BOUNCED",
					dueAt: new Date(now - OUTSIDE_MS),
					createdAt: new Date(now - OUTSIDE_MS),
					sentAt: new Date(now - 2 * DAY_MS),
				},
				{
					recipientId,
					pass: 3,
					status: "SENT",
					dueAt: new Date(now - DAY_MS),
					createdAt: new Date(now - DAY_MS),
					sentAt: new Date(now - OUTSIDE_MS),
				},
				{
					recipientId,
					pass: 4,
					status: "QUEUED",
					dueAt: new Date(now),
					createdAt: new Date(now),
				},
			],
		});

		const after = await campaigns.overview();

		expect(after.thirtyDays.sent - before.thirtyDays.sent).toBe(2);
		expect(after.thirtyDays.bounced - before.thirtyDays.bounced).toBe(1);
	});
});
