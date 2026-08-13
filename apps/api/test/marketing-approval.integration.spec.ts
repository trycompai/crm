import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import { MarketingCampaignsService } from "../src/marketing/marketing-campaigns.service";
import type { MarketingTemplatesService } from "../src/marketing/marketing-templates.service";
import type { ResendService } from "../src/marketing/resend.service";

const TAG = `approve${Date.now()}`;

const resend = {
	readDomain: async () => ({
		id: "dom_1",
		name: "mail.example.test",
		status: "verified",
		records: [],
		openTracking: false,
		clickTracking: false,
	}),
} as unknown as ResendService;

const templates = {} as unknown as MarketingTemplatesService;

const campaigns = new MarketingCampaignsService(db, resend, templates);

let segmentId: string;
let campaignId: string;

async function clean() {
	await db.marketingCampaign.deleteMany({ where: { name: { contains: TAG } } });
	await db.marketingSegment.deleteMany({ where: { name: { contains: TAG } } });
}

beforeAll(async () => {
	await clean();

	const segment = await db.marketingSegment.create({
		data: {
			name: `${TAG} everybody`,
			definition: { facet: { facet: "contact.hasEmail" } },
		},
		select: { id: true },
	});

	segmentId = segment.id;
});

beforeEach(async () => {
	await db.marketingCampaign.deleteMany({ where: { name: { contains: TAG } } });

	const campaign = await db.marketingCampaign.create({
		data: {
			name: `${TAG} staged`,
			kind: "DRIP",
			entryMode: "CONTINUOUS",
			status: "PENDING_APPROVAL",
			segments: { create: [{ segmentId, mode: "INCLUDE" }] },
			pausedReason: "The agent built this overnight.",
			nodes: {
				create: [{ kind: "EMAIL", subject: "Hello", x: 0, y: 0 }],
			},
		},
		select: { id: true },
	});

	campaignId = campaign.id;
});

afterAll(clean);

describe("what is waiting for a person", () => {
	it("lists a staged campaign with its note and audience", async () => {
		const rows = await campaigns.pending();
		const row = rows.find((candidate) => candidate.id === campaignId);

		expect(row?.note).toBe("The agent built this overnight.");
		expect(row?.segment?.id).toBe(segmentId);
		expect(row?.nodes).toBe(1);
	});

	it("sends it back to draft, and nothing is queued", async () => {
		await campaigns.reject(campaignId, "Too many touches.");

		const row = await db.marketingCampaign.findUniqueOrThrow({
			where: { id: campaignId },
			select: { status: true, scheduledAt: true, pausedReason: true },
		});

		expect(row.status).toBe("DRAFT");
		expect(row.scheduledAt).toBeNull();
		expect(row.pausedReason).toBe("Too many touches.");
		expect(await db.marketingSend.count({ where: { campaignId } })).toBe(0);
	});

	it("refuses to approve something nobody staged", async () => {
		await campaigns.reject(campaignId);

		expect(campaigns.approve(campaignId)).rejects.toThrow(
			/not pending approval/,
		);
	});

	it("drops it out of the waiting list once it is decided", async () => {
		await campaigns.reject(campaignId);

		const rows = await campaigns.pending();

		expect(rows.find((row) => row.id === campaignId)).toBeUndefined();
	});
});

describe("changing a campaign between a blast and a drip", () => {
	it("switches a draft and swaps the entry mode with it", async () => {
		await campaigns.reject(campaignId);
		await campaigns.setKind(campaignId, "BLAST");

		const row = await db.marketingCampaign.findUniqueOrThrow({
			where: { id: campaignId },
			select: { kind: true, entryMode: true },
		});

		expect(row.kind).toBe("BLAST");
		expect(row.entryMode).toBe("MANUAL");
	});

	it("refuses a drip whose only step is not an email", async () => {
		await campaigns.reject(campaignId);
		await db.marketingCampaignNode.deleteMany({ where: { campaignId } });
		await db.marketingCampaignNode.create({
			data: { campaignId, kind: "WAIT", delayHours: 24, x: 0, y: 0 },
		});

		expect(campaigns.setKind(campaignId, "BLAST")).rejects.toThrow(
			/not an email/,
		);
	});

	it("refuses to collapse a drip that has more than one step", async () => {
		await campaigns.reject(campaignId);
		await db.marketingCampaignNode.create({
			data: { campaignId, kind: "WAIT", delayHours: 24, x: 0, y: 120 },
		});

		expect(campaigns.setKind(campaignId, "BLAST")).rejects.toThrow(/one email/);
	});

	it("refuses once it is no longer a draft", async () => {
		expect(campaigns.setKind(campaignId, "BLAST")).rejects.toThrow(
			/Only a draft/,
		);
	});
});
