import { defineTool } from "eve/tools";
import { z } from "zod";
import { readSegment } from "../lib/marketing";

export default defineTool({
	description:
		"Read one marketing segment: its rules and how many people match today. Free.",
	inputSchema: z.object({ segmentId: z.string().min(1) }),
	async execute(input) {
		return readSegment(input.segmentId);
	},
});
