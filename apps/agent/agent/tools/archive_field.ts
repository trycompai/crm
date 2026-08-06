import { defineTool } from "eve/tools";
import { z } from "zod";
import { sensitiveWrite } from "../lib/approval";
import { archiveField } from "../lib/fields";

export default defineTool({
	description:
		"Archive a custom field. It leaves every sheet and table and stops being filled; the values already recorded are kept. A schema change every rep will see, so it needs a person.",
	inputSchema: z.object({
		entity: z.enum(["COMPANY", "CONTACT", "DEAL"]),
		key: z.string().describe("The field's key, as list_fields reports it."),
	}),
	approval: sensitiveWrite(
		"Say which field you would archive and let a rep do it from the Fields sheet.",
	),
	async execute(input) {
		return archiveField(input);
	},
});
