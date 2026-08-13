import { defineTool } from "eve/tools";
import { z } from "zod";
import { readTemplate } from "../lib/marketing";

export default defineTool({
	description:
		"Read one email template as its block document, not as HTML. Free.",
	inputSchema: z.object({ templateId: z.string().min(1) }),
	async execute(input) {
		return readTemplate(input.templateId);
	},
});
