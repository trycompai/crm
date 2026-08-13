import { defineTool } from "eve/tools";
import { z } from "zod";
import { isAutomated } from "../lib/approval";
import { graphEditNeedsPerson, writeCampaignGraph } from "../lib/marketing";

const node = z.object({
	id: z
		.string()
		.min(1)
		.describe(
			"Any stable string. Reuse the id from read_campaign to keep a node.",
		),
	kind: z.enum(["EMAIL", "WAIT", "BRANCH", "SPLIT", "EXIT"]),
	label: z.string().max(120).optional(),
	subject: z.string().max(200).optional(),
	preheader: z.string().max(300).optional(),
	document: z.record(z.string(), z.unknown()).optional(),
	delayHours: z.number().int().min(0).max(8760).optional(),
	condition: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("A BRANCH only. The same filter tree a segment uses."),
});

const edge = z.object({
	fromId: z.string().min(1),
	toId: z.string().min(1),
	handle: z
		.string()
		.default("next")
		.describe('A BRANCH uses "yes" and "no". A SPLIT uses one handle per arm.'),
	label: z.string().max(60).optional(),
	weight: z
		.number()
		.int()
		.min(0)
		.max(100)
		.default(100)
		.describe("A SPLIT's arms must add up to 100."),
});

export default defineTool({
	description:
		"Read the `writing-an-email` skill first: the block document shape is not guessable. Write a campaign's whole graph — every node and every edge — in one call. Do not send coordinates; the server lays it out. The graph must run forwards only, have one starting point, and give every branch both arms. Anything wrong comes back as problems for you to fix rather than being saved. This never activates anything.",
	inputSchema: z.object({
		campaignId: z.string().min(1),
		nodes: z.array(node).min(1).max(60),
		edges: z.array(edge).max(120),
	}),
	approval: async ({ session, toolInput }) => {
		const id = (toolInput as { campaignId?: string } | undefined)?.campaignId;
		if (!id) return "not-applicable";

		if (!(await graphEditNeedsPerson(id))) return "not-applicable";

		return isAutomated(session)
			? {
					type: "denied" as const,
					reason:
						"This campaign has left draft and people are walking it. Only a person edits it.",
				}
			: "user-approval";
	},
	async execute(input) {
		return writeCampaignGraph({
			campaignId: input.campaignId,
			nodes: input.nodes,
			edges: input.edges,
		});
	},
});
