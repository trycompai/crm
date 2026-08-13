import { defineTool } from "eve/tools";
import { z } from "zod";
import { readShell } from "../lib/marketing";

export default defineTool({
	description:
		"Read the header or the footer every email wears — its name, its blocks and how many templates pick it. Free.",
	inputSchema: z.object({ shellId: z.string().min(1) }),
	async execute(input) {
		return readShell(input.shellId);
	},
});
