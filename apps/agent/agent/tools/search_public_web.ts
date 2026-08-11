import { defineTool } from "eve/tools";
import { z } from "zod";
import { spend } from "../lib/focus";
import { searchTavily } from "../lib/tavily";

export default defineTool({
	description:
		"Search the current public web for official company pages, careers, individual job postings, team pages and public professional sources. Results are candidate URLs only. Fetch a result before recording it as evidence.",
	inputSchema: z.object({
		query: z.string().trim().min(3),
		depth: z.enum(["basic", "advanced"]).default("advanced"),
		maxResults: z.number().int().min(1).max(10).default(6),
		includeDomains: z.array(z.string().trim().min(1)).max(10).optional(),
	}),
	async execute({ query, depth, maxResults, includeDomains }) {
		const charge = spend(depth === "advanced" ? 2 : 1);
		if (!charge.ok) return { ok: false as const, reason: charge.reason };

		return searchTavily(query, { depth, maxResults, includeDomains });
	},
});
