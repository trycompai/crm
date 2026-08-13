import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { resolveChrome } from "../lib/chrome";
import { draftEmail, reviewEmail } from "../lib/email-review";
import { EMAIL_REVIEW } from "../lib/email-review-config";

export default defineTool({
	description:
		"Look at an email the way a reader will: render it in a real browser at 600px (desktop) and 390px (mobile), measure the first screen, and report what was observed — image coverage, visible text, anything oversized, cut off, upscaled or empty. A block document can pass every linter and still open on a wall of image, so call this after write_template, update_node or write_campaign_graph changes an email, and before telling the rep it is done. Pass exactly one of templateId, nodeId, or draft. Costs no vendor credits; the measurements are free, and the visual read is one small vision-model call when this install has a gateway credential.",
	inputSchema: z.object({
		templateId: z.string().min(1).optional(),
		nodeId: z
			.string()
			.min(1)
			.optional()
			.describe("An EMAIL step, from read_campaign."),
		draft: draftEmail
			.optional()
			.describe(
				"Content not saved anywhere yet. document is the whole body, as write_template writes it.",
			),
	}),
	async execute(input) {
		const executablePath = resolveChrome();

		if (!executablePath) return unavailable(EMAIL_REVIEW.chrome.env);

		return reviewEmail(input, executablePath);
	},
});
