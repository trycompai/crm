import { defineTool } from "eve/tools";
import { z } from "zod";
import { writeSegment } from "../lib/marketing";

export default defineTool({
	description:
		"Create or update a marketing segment from a filter tree. Rules that cannot be read come back as problems for you to fix rather than being saved. Preview first. Free.",
	inputSchema: z.object({
		segmentId: z
			.string()
			.optional()
			.describe("Omit to create a new segment; pass it to rewrite the rules."),
		name: z.string().min(1).max(160),
		description: z.string().max(400).optional(),
		definition: z.record(z.string(), z.unknown()),
	}),
	async execute(input) {
		return writeSegment({
			id: input.segmentId,
			name: input.name,
			description: input.description,
			definition: input.definition,
		});
	},
});
