import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { isAutomated } from "../lib/approval";
import { updateCampaignNode } from "../lib/marketing";

export default defineTool({
	description:
		"Change one node in a campaign, in place. Use this for 'make touch three shorter' or 'wait five days instead of three' rather than rewriting the whole graph — it keeps every other node and every hand-placed position. Pass only the fields you are changing. It never activates anything. After changing an EMAIL node, call review_email on it to see what a reader sees. Free.",
	inputSchema: z.object({
		nodeId: z
			.string()
			.min(1)
			.describe("From read_campaign. The node you are changing."),
		label: z.string().max(120).optional(),
		subject: z.string().max(200).optional().describe("An EMAIL only."),
		preheader: z.string().max(300).optional().describe("An EMAIL only."),
		document: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("An EMAIL only. The whole body, as write_template writes it."),
		delayHours: z
			.number()
			.int()
			.min(0)
			.max(8760)
			.optional()
			.describe("A WAIT only."),
		condition: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("A BRANCH only. The same filter tree a segment uses."),
	}),
	approval: async ({ session, toolInput }) => {
		const nodeId = (toolInput as { nodeId?: string } | undefined)?.nodeId;
		if (!nodeId) return "not-applicable";

		const node = await db.marketingCampaignNode.findUnique({
			where: { id: nodeId },
			select: { campaign: { select: { status: true } } },
		});

		if (node?.campaign.status !== "ACTIVE") return "not-applicable";

		if (isAutomated(session)) {
			return {
				type: "denied" as const,
				reason:
					"That campaign is live and people are walking it. Editing a live node is not something to do unattended.",
			};
		}

		return "user-approval";
	},
	async execute(input) {
		return updateCampaignNode(input);
	},
});
