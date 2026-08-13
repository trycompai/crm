import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	graphEditNeedsPerson,
	writeCampaignGraph,
} from "../agent/lib/marketing";

type GraphResult = Awaited<ReturnType<typeof writeCampaignGraph>>;

function codesOf(result: GraphResult): string[] {
	return "problems" in result
		? result.problems.map((problem) => problem.code)
		: [];
}

const suffix = process.env.TEST_RUN_ID ?? "graph-spec";
const TAG = `graph-${suffix}`;
const ADDRESS = `walker-${TAG}@example.com`;

const DOCUMENT = {
	version: 1,
	blocks: [
		{ type: "text", text: [{ text: "We have something for you." }] },
		{ type: "button", label: "Book a call", href: "https://example.com/book" },
	],
};

let firstId: string;
let secondId: string;
let firstEmailId: string;
let firstWaitId: string;
let secondEmailId: string;
let enrolmentId: string;

async function cleanup() {
	await db.marketingCampaign.deleteMany({ where: { name: { contains: TAG } } });
	await db.marketingRecipient.deleteMany({ where: { address: ADDRESS } });
	await db.contact.deleteMany({ where: { email: ADDRESS } });
}

beforeAll(async () => {
	await cleanup();

	const first = await db.marketingCampaign.create({
		data: {
			name: `${TAG} first`,
			kind: "DRIP",
			status: "DRAFT",
			nodes: {
				create: [
					{
						kind: "EMAIL",
						label: "Touch 1",
						subject: "Hello",
						document: DOCUMENT,
						x: 0,
						y: 0,
					},
					{ kind: "WAIT", label: "Wait", delayHours: 48, x: 0, y: 120 },
				],
			},
		},
		select: { id: true, nodes: { select: { id: true, kind: true } } },
	});

	firstId = first.id;
	firstEmailId = first.nodes.find((node) => node.kind === "EMAIL")?.id ?? "";
	firstWaitId = first.nodes.find((node) => node.kind === "WAIT")?.id ?? "";

	const second = await db.marketingCampaign.create({
		data: {
			name: `${TAG} second`,
			kind: "DRIP",
			status: "DRAFT",
			nodes: {
				create: [
					{ kind: "EMAIL", label: "Touch 1", subject: "Hi", x: 0, y: 0 },
				],
			},
		},
		select: { id: true, nodes: { select: { id: true } } },
	});

	secondId = second.id;
	secondEmailId = second.nodes[0]?.id ?? "";
});

afterAll(cleanup);

describe("what the graph writer refuses", () => {
	it("refuses an email whose document cannot be read", async () => {
		const result = await writeCampaignGraph({
			campaignId: secondId,
			nodes: [
				{ id: secondEmailId, kind: "EMAIL", subject: "Hi", document: {} },
			],
			edges: [],
		});

		expect(result).toHaveProperty("error");
		expect(codesOf(result)).toContain("email-unreadable-document");

		const node = await db.marketingCampaignNode.findUniqueOrThrow({
			where: { id: secondEmailId },
			select: { document: true },
		});

		expect(node.document).toBeNull();
	});

	it("refuses an email with no blocks, because it would go out blank", async () => {
		const result = await writeCampaignGraph({
			campaignId: secondId,
			nodes: [
				{
					id: secondEmailId,
					kind: "EMAIL",
					subject: "Hi",
					document: { version: 1, blocks: [] },
				},
			],
			edges: [],
		});

		expect(codesOf(result)).toContain("email-empty");
	});

	it("refuses a node id that belongs to another campaign", async () => {
		const result = await writeCampaignGraph({
			campaignId: secondId,
			nodes: [
				{
					id: firstEmailId,
					kind: "EMAIL",
					subject: "Stolen",
					document: DOCUMENT,
				},
			],
			edges: [],
		});

		expect(result).toHaveProperty("error");
		expect(codesOf(result)).toContain("node-other-campaign");

		const node = await db.marketingCampaignNode.findUniqueOrThrow({
			where: { id: firstEmailId },
			select: { campaignId: true, subject: true },
		});

		expect(node.campaignId).toBe(firstId);
		expect(node.subject).toBe("Hello");
	});

	it("refuses to delete a node people stand on", async () => {
		const contact = await db.contact.create({
			data: { firstName: "Walker", email: ADDRESS },
			select: { id: true },
		});

		const recipient = await db.marketingRecipient.create({
			data: { address: ADDRESS, contactId: contact.id },
			select: { id: true },
		});

		const enrolment = await db.marketingEnrolment.create({
			data: {
				campaignId: firstId,
				contactId: contact.id,
				recipientId: recipient.id,
				status: "ACTIVE",
				currentNodeId: firstWaitId,
			},
			select: { id: true },
		});

		enrolmentId = enrolment.id;

		const result = await writeCampaignGraph({
			campaignId: firstId,
			nodes: [
				{
					id: firstEmailId,
					kind: "EMAIL",
					subject: "Hello",
					document: DOCUMENT,
				},
			],
			edges: [],
		});

		expect(result).toHaveProperty("error");
		expect(codesOf(result)).toContain("node-has-people");

		const nodes = await db.marketingCampaignNode.count({
			where: { campaignId: firstId },
		});

		expect(nodes).toBe(2);
	});

	it("writes the graph once nobody stands on the node it deletes", async () => {
		await db.marketingEnrolment.delete({ where: { id: enrolmentId } });

		const result = await writeCampaignGraph({
			campaignId: firstId,
			nodes: [
				{
					id: firstEmailId,
					kind: "EMAIL",
					subject: "Hello",
					preheader: "One line",
					document: DOCUMENT,
				},
			],
			edges: [],
		});

		expect(result).toMatchObject({ ok: true });

		const nodes = await db.marketingCampaignNode.findMany({
			where: { campaignId: firstId },
			select: { id: true },
		});

		expect(nodes).toHaveLength(1);
		expect(nodes[0]?.id).toBe(firstEmailId);
	});
});

describe("who may edit a graph", () => {
	it("edits a draft silently and asks a person for every other status", async () => {
		expect(await graphEditNeedsPerson(firstId)).toBe(false);

		for (const status of [
			"ACTIVE",
			"DRAINING",
			"PAUSED",
			"SCHEDULED",
		] as const) {
			await db.marketingCampaign.update({
				where: { id: firstId },
				data: { status },
			});

			expect(await graphEditNeedsPerson(firstId)).toBe(true);
		}

		await db.marketingCampaign.update({
			where: { id: firstId },
			data: { status: "DRAFT" },
		});
	});
});
