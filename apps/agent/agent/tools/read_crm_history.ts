import { defineTool } from "eve/tools";
import { z } from "zod";
import { readCrmHistory } from "../lib/crm";
import { focusOn } from "../lib/focus";

export default defineTool({
	description:
		"Read everything the CRM already has on a contact: email threads with full message bodies, meetings, whether they have ever replied, their company and its id, the deals they are on, and who else we know at their company. Free, fast, and the best evidence there is — call it before paying for a lookup.",
	inputSchema: z.object({
		contactId: z.string(),
		threads: z
			.number()
			.int()
			.min(1)
			.max(20)
			.default(5)
			.describe("How many recent threads to read."),
	}),
	async execute({ contactId, threads }) {
		focusOn({ contactId });

		const history = await readCrmHistory(contactId, { threads });
		if (!history) return { found: false as const, reason: "No such contact." };

		const evidence =
			history.stats.emails === 0 && history.stats.meetings === 0
				? "We have never actually spoken to this person. Nothing here is evidence of anything."
				: "For a reply or signature from their own address, use its message id as sourceId. The reply and signature from one message are one source. A meeting with accepted=true and attended=false is an RSVP only. Use a meeting id for crm.meeting-attendance only when attended=true.";

		const reach = history.contact.company
			? ` Their company is \`${history.contact.company.id}\` — read_company_history or enrich_company take that id directly.`
			: " They are not attached to a company; search_crm will find one by name or domain if the question needs it.";

		return {
			found: true as const,
			...history,
			note: evidence + reach,
		};
	},
});
