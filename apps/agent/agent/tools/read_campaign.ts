import { defineTool } from "eve/tools";
import { z } from "zod";
import { readCampaign } from "../lib/marketing";

export default defineTool({
	description:
		"Read a campaign: its graph, its entry and exit rules, and how each touch is performing — sent, opened, clicked, replied, and how many people are standing on each node right now. Use this to answer which touch is underperforming. Free.",
	inputSchema: z.object({ campaignId: z.string().min(1) }),
	async execute(input) {
		return readCampaign(input.campaignId);
	},
});
