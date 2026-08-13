import { defineTool } from "eve/tools";
import { z } from "zod";
import { stageCampaign } from "../lib/marketing";

export default defineTool({
	description:
		"Stage a draft campaign for a person to approve. It moves to PENDING_APPROVAL and appears in Marketing under Waiting for you, with your note saying what you built and why. Nothing is sent and nothing goes live: a person reads the graph and clicks Approve. This is how an unattended run leaves finished work behind. Free.",
	inputSchema: z.object({
		campaignId: z.string().min(1),
		at: z
			.string()
			.datetime()
			.optional()
			.describe(
				"When you propose it goes out, as an ISO timestamp. Omit for as soon as somebody approves it.",
			),
		note: z
			.string()
			.min(1)
			.max(600)
			.describe(
				"What you built, who it goes to and why now. This is the whole of what the reviewer reads first.",
			),
	}),
	async execute(input) {
		return stageCampaign({
			campaignId: input.campaignId,
			at: input.at ? new Date(input.at) : null,
			note: input.note,
		});
	},
});
