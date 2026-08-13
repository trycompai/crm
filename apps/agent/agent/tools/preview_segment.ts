import { defineTool } from "eve/tools";
import { z } from "zod";
import { previewSegment } from "../lib/marketing";

export default defineTool({
	description:
		"Count and sample the people a set of segment rules would match, without saving anything. Use this before write_segment so you can tell the rep how many people they are about to talk to. Returns contact ids. Free.",
	inputSchema: z.object({
		definition: z
			.record(z.string(), z.unknown())
			.describe(
				'A filter tree: {all|any|not|facet}. A facet looks like {"facet":{"facet":"tracking.visitedPath","path":"/pricing"}}. Call read_segment on an existing segment to see the shape.',
			),
		limit: z.number().int().min(1).max(50).default(20),
	}),
	async execute(input) {
		return previewSegment(input.definition, input.limit);
	},
});
