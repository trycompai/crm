import { defineTool } from "eve/tools";
import { z } from "zod";
import { readGranolaNote } from "../lib/accounts";

export default defineTool({
	description:
		"Read one imported Granola call in full, including its summary, attendees and attributed transcript. Use the note id returned by read_company_history, read_deal_history or read_crm_history. A transcript speaker attribution that matches a contact's email and name is first-party crm.granola-transcript evidence; an invitee list or summary alone is not. This reads CRM data only and is free.",
	inputSchema: z.object({ noteId: z.string() }),
	async execute({ noteId }) {
		const note = await readGranolaNote(noteId);
		return note
			? { found: true as const, note }
			: { found: false as const, reason: "No such Granola note." };
	},
});
