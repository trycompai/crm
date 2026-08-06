import { defineTool } from "eve/tools";
import { z } from "zod";
import { readRunRecord } from "../../../lib/run-runtime";
import { requireTeamAgentAttribute } from "../../../lib/session-purpose";

export default defineTool({
	description:
		"Read one approved CRM record with its CRM history and only the connected email or calendar sources approved by this version.",
	inputSchema: z.object({
		kind: z.enum(["contact", "company", "deal"]),
		id: z.string().min(1),
	}),
	async execute(input, ctx) {
		return readRunRecord(requireTeamAgentAttribute(ctx, "runId"), input);
	},
});
