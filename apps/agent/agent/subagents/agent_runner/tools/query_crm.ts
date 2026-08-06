import { defineTool } from "eve/tools";
import { z } from "zod";
import { queryRunCrm } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Search contacts, companies, and deals inside this deployed version's approved CRM scope.",
	inputSchema: z.object({
		query: z.string().trim().min(2).max(160),
		kinds: z.array(z.enum(["contact", "company", "deal"])).optional(),
		limit: z.number().int().min(1).max(50).default(20),
	}),
	async execute(input, ctx) {
		return queryRunCrm(requireTeamAgentAttribute(ctx, "runId"), input);
	},
});
