import { defineTool } from "eve/tools";
import { z } from "zod";
import { listTemplates } from "../lib/marketing";

export default defineTool({
	description: "List the marketing email templates. Free.",
	inputSchema: z.object({
		limit: z.number().int().min(1).max(100).default(50),
	}),
	async execute(input) {
		return listTemplates(input.limit);
	},
});
