import { defineTool } from "eve/tools";
import { z } from "zod";
import { readCrmHistory } from "../lib/crm";
import { focusOn } from "../lib/focus";

export default defineTool({
	description:
		"Read everything the CRM already has on a contact: email threads with full message bodies, calendar meetings, imported Granola call summaries and note ids, whether they have ever replied, their company and its id, the deals they are on, and who else we know at their company. Free, fast, and the best evidence there is — call it before paying for a lookup.",
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
			history.stats.emails === 0 &&
			history.stats.meetings === 0 &&
			history.granolaCalls.length === 0
				? "We have never actually spoken to this person. Nothing here is evidence of anything."
				: [
						history.stats.emails > 0
							? "A signature block or a reply from their own address is primary evidence — record it as `crm.signature-block` or `crm.thread-reply`."
							: "",
						history.granolaCalls.length > 0
							? "Read the relevant call with `read_granola_note`. An attributed transcript matching their email and name is `crm.granola-transcript`; an invitee list or summary alone is not identity proof."
							: "",
					]
						.filter(Boolean)
						.join(" ");

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
