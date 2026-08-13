import { db } from "@crm/db";
import { EMPTY_DOCUMENT } from "@crm/email/document";
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
	description:
		"Create a marketing campaign as a draft, and return its id so you can write its graph. A blast goes to a segment once; a drip follows up over weeks and can branch. Nothing sends until a person schedules the blast or activates the drip.",
	inputSchema: z.object({
		name: z.string().min(1).max(160),
		kind: z.enum(["BLAST", "DRIP"]),
		segmentIds: z
			.array(z.string().min(1))
			.max(20)
			.optional()
			.describe(
				"Segments whose people receive this. Everybody in any of them.",
			),
		excludeSegmentIds: z
			.array(z.string().min(1))
			.max(20)
			.optional()
			.describe(
				"Segments held out. Anybody in one of these never receives it.",
			),
	}),
	async execute(input) {
		const chosen = new Map<string, "INCLUDE" | "EXCLUDE">();

		for (const segmentId of input.segmentIds ?? []) {
			chosen.set(segmentId, "INCLUDE");
		}

		for (const segmentId of input.excludeSegmentIds ?? []) {
			chosen.set(segmentId, "EXCLUDE");
		}

		const segments = [...chosen].map(([segmentId, mode]) => ({
			segmentId,
			mode,
		}));

		const campaign = await db.marketingCampaign.create({
			data: {
				name: input.name,
				kind: input.kind,
				segments: { create: segments },
				entryMode: input.kind === "DRIP" ? "CONTINUOUS" : "MANUAL",
				nodes: {
					create: {
						kind: "EMAIL",
						label: input.kind === "DRIP" ? "Touch 1" : "The email",
						subject: "",
						document: EMPTY_DOCUMENT as object,
					},
				},
			},
			select: { id: true, nodes: { select: { id: true } } },
		});

		return {
			campaignId: campaign.id,
			firstNodeId: campaign.nodes[0]?.id,
			status: "DRAFT",
			next:
				input.kind === "BLAST"
					? "Write the one email with write_campaign_graph, then tell the rep to open it and schedule it. A blast is scheduled, not activated."
					: "Write the graph with write_campaign_graph, then tell the rep to open it and activate it.",
		};
	},
});
