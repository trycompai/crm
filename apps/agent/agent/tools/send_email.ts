import { defineTool } from "eve/tools";
import { z } from "zod";
import { sensitiveWrite } from "../lib/approval";
import { sendDirectEmail } from "../lib/marketing";

export default defineTool({
	description:
		"Send one marketing email to one named contact, using a template. It is marketing mail like any other: it gets the shell, the footer and the unsubscribe link, and it is refused with a reason if that person unsubscribed. Use this only when the rep named both the person and the template. To reach a segment, build a campaign instead.",
	inputSchema: z.object({
		contactId: z.string().min(1),
		templateId: z.string().min(1),
	}),
	approval: sensitiveWrite(
		"Ask the rep to send it, or stage a campaign they can review.",
	),
	async execute(input, ctx) {
		return sendDirectEmail({
			contactId: input.contactId,
			templateId: input.templateId,
			requestedById: ctx.session.auth.current?.principalId,
		});
	},
});
