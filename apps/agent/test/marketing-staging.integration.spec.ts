import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	readShell,
	stageCampaign,
	updateCampaignNode,
	writeShell,
} from "../agent/lib/marketing";
import {
	campaignPreamble,
	segmentPreamble,
	shellPreamble,
} from "../agent/lib/preamble";

const suffix = process.env.TEST_RUN_ID ?? "staging-spec";
const TAG = `stage-${suffix}`;

let segmentId: string;
let campaignId: string;
let emailNodeId: string;
let waitNodeId: string;

async function cleanup() {
	await db.marketingCampaign.deleteMany({ where: { name: { contains: TAG } } });
	await db.marketingSegment.deleteMany({ where: { name: { contains: TAG } } });
}

beforeAll(async () => {
	await cleanup();

	const segment = await db.marketingSegment.create({
		data: {
			name: `${TAG} everybody`,
			definition: { facet: { facet: "contact.hasEmail" } },
		},
		select: { id: true },
	});
	segmentId = segment.id;

	const campaign = await db.marketingCampaign.create({
		data: {
			name: `${TAG} win-back`,
			kind: "DRIP",
			status: "DRAFT",
			segments: { create: [{ segmentId, mode: "INCLUDE" }] },
			nodes: {
				create: [
					{ kind: "EMAIL", label: "Touch 1", subject: "Hello", x: 0, y: 0 },
					{ kind: "WAIT", label: "Wait", delayHours: 48, x: 0, y: 120 },
				],
			},
		},
		select: { id: true, nodes: { select: { id: true, kind: true } } },
	});

	campaignId = campaign.id;
	emailNodeId = campaign.nodes.find((node) => node.kind === "EMAIL")?.id ?? "";
	waitNodeId = campaign.nodes.find((node) => node.kind === "WAIT")?.id ?? "";
});

afterAll(cleanup);

describe("staging a campaign for a person", () => {
	it("moves a draft to PENDING_APPROVAL and keeps the note", async () => {
		const result = await stageCampaign({
			campaignId,
			at: new Date("2026-08-14T09:00:00Z"),
			note: "Six touches for the people who went quiet after a demo.",
		});

		expect(result).toMatchObject({ ok: true, status: "PENDING_APPROVAL" });

		const row = await db.marketingCampaign.findUniqueOrThrow({
			where: { id: campaignId },
			select: { status: true, scheduledAt: true, pausedReason: true },
		});

		expect(row.status).toBe("PENDING_APPROVAL");
		expect(row.pausedReason).toContain("quiet after a demo");
		expect(row.scheduledAt?.toISOString()).toBe("2026-08-14T09:00:00.000Z");
	});

	it("refuses a campaign that is already live", async () => {
		await db.marketingCampaign.update({
			where: { id: campaignId },
			data: { status: "ACTIVE" },
		});

		const result = await stageCampaign({
			campaignId,
			note: "Trying again",
		});

		expect(result).toHaveProperty("error");

		await db.marketingCampaign.update({
			where: { id: campaignId },
			data: { status: "DRAFT" },
		});
	});

	it("refuses a campaign with no segment", async () => {
		const orphan = await db.marketingCampaign.create({
			data: {
				name: `${TAG} orphan`,
				kind: "BLAST",
				status: "DRAFT",
				nodes: { create: [{ kind: "EMAIL", subject: "Hi", x: 0, y: 0 }] },
			},
			select: { id: true },
		});

		const result = await stageCampaign({
			campaignId: orphan.id,
			note: "No audience",
		});

		expect(result).toHaveProperty("error");
	});
});

describe("changing one node", () => {
	it("rewrites the subject without touching the rest of the graph", async () => {
		const result = await updateCampaignNode({
			nodeId: emailNodeId,
			subject: "Shorter",
		});

		expect(result).toMatchObject({ ok: true });

		const nodes = await db.marketingCampaignNode.findMany({
			where: { campaignId },
			select: { id: true, subject: true, delayHours: true },
		});

		expect(nodes).toHaveLength(2);
		expect(nodes.find((node) => node.id === emailNodeId)?.subject).toBe(
			"Shorter",
		);
		expect(nodes.find((node) => node.id === waitNodeId)?.delayHours).toBe(48);
	});

	it("refuses a delay on an email and a subject on a wait", async () => {
		expect(
			await updateCampaignNode({ nodeId: emailNodeId, delayHours: 12 }),
		).toHaveProperty("error");

		expect(
			await updateCampaignNode({ nodeId: waitNodeId, subject: "No" }),
		).toHaveProperty("error");
	});

	it("says when the campaign it belongs to is live", async () => {
		await db.marketingCampaign.update({
			where: { id: campaignId },
			data: { status: "ACTIVE" },
		});

		expect(
			await updateCampaignNode({ nodeId: waitNodeId, delayHours: 72 }),
		).toMatchObject({ ok: true, live: true });

		await db.marketingCampaign.update({
			where: { id: campaignId },
			data: { status: "DRAFT" },
		});
	});
});

describe("the preamble a rep's co-pilot opens with", () => {
	it("names the campaign and refuses to make a second one", async () => {
		const { markdown } = await campaignPreamble(campaignId);

		expect(markdown).toContain(campaignId);
		expect(markdown).toContain("do not make a second one");
		expect(markdown).toContain("write_campaign_graph");
	});

	it("names the segment and the tool that edits it", async () => {
		const { markdown } = await segmentPreamble(segmentId);

		expect(markdown).toContain(segmentId);
		expect(markdown).toContain("write_segment");
		expect(markdown).toContain("building-a-segment");
	});
});

describe("the header and footer the co-pilot can edit", () => {
	it("names the shell and the tool that writes it", async () => {
		const shell = await db.marketingPartial.create({
			data: {
				kind: "HEADER",
				name: `${TAG} header`,
				document: { version: 1, blocks: [] },
			},
			select: { id: true },
		});

		const { markdown } = await shellPreamble(shell.id);

		expect(markdown).toContain(shell.id);
		expect(markdown).toContain("write_shell");
		expect(markdown).toContain("read_shell");
		expect(markdown).toContain("An empty document is normal");

		await db.marketingPartial.delete({ where: { id: shell.id } });
	});

	it("writes the blocks and refuses a document it cannot read", async () => {
		const shell = await db.marketingPartial.create({
			data: {
				kind: "FOOTER",
				name: `${TAG} footer`,
				isDefault: true,
				document: { version: 1, blocks: [] },
			},
			select: { id: true },
		});

		const written = await writeShell({
			shellId: shell.id,
			document: {
				version: 1,
				blocks: [{ type: "text", text: [{ text: "Why you got this" }] }],
			},
		});

		expect(written).toMatchObject({ ok: true });
		expect(await readShell(shell.id)).toMatchObject({ kind: "FOOTER" });

		expect(
			await writeShell({ shellId: shell.id, document: { blocks: "no" } }),
		).toHaveProperty("error");

		await db.marketingPartial.delete({ where: { id: shell.id } });
	});

	it("refuses a header or footer outgoing mail does not wear", async () => {
		const shell = await db.marketingPartial.create({
			data: {
				kind: "FOOTER",
				name: `${TAG} spare footer`,
				document: { version: 1, blocks: [] },
			},
			select: { id: true },
		});

		const written = await writeShell({
			shellId: shell.id,
			document: {
				version: 1,
				blocks: [{ type: "text", text: [{ text: "Never worn" }] }],
			},
		});

		expect(written).toHaveProperty("error");

		const kept = await db.marketingPartial.findUniqueOrThrow({
			where: { id: shell.id },
			select: { document: true },
		});

		expect(kept.document).toEqual({ version: 1, blocks: [] });

		await db.marketingPartial.delete({ where: { id: shell.id } });
	});
});
