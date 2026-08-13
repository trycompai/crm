import { defineTool } from "eve/tools";
import { z } from "zod";
import { listSegments } from "../lib/marketing";

export default defineTool({
	description:
		"List the marketing segments, with how many people are in each right now. A segment is a saved question about the contacts, shared by every campaign. Free.",
	inputSchema: z.object({
		limit: z.number().int().min(1).max(100).default(50),
	}),
	async execute(input) {
		return listSegments(input.limit);
	},
});
