import { defineTool } from "eve/tools";
import { z } from "zod";
import { writeTemplate } from "../lib/marketing";

export default defineTool({
	description:
		"Read the `creating-a-template` skill first for what a good template contains, and `writing-an-email` for the block document shape, which is not guessable. Create or update a marketing email template from a block document. The linter runs first and refuses errors back to you — fix them and call again. You write the body only; the header, the footer, the postal address and the unsubscribe link are added by the compiler and are not yours to set. After a save is accepted, call review_email to see what a reader sees — the linter checks structure, not looks. Free.",
	inputSchema: z.object({
		templateId: z.string().optional(),
		name: z.string().min(1).max(160),
		subject: z
			.string()
			.min(1)
			.max(150)
			.describe("Under 50 characters survives the cut on most phones."),
		preheader: z
			.string()
			.max(300)
			.optional()
			.describe(
				"The line the inbox shows after the subject. Without it, the inbox shows the first line of the body.",
			),
		document: z
			.record(z.string(), z.unknown())
			.describe(
				'{"version":1,"blocks":[…]}. Blocks: heading, text, button, image, quote, divider, spacer, columns. Merge tags go inside text, as {{contact.firstName|there}} — always with a fallback.',
			),
	}),
	async execute(input) {
		return writeTemplate({
			id: input.templateId,
			name: input.name,
			subject: input.subject,
			preheader: input.preheader,
			document: input.document,
		});
	},
});
