import { blobEnabled } from "@crm/db/blob";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { spend } from "../lib/focus";
import { runPortrait } from "../lib/portrait";
import { assertResearchPurpose } from "../lib/session-purpose";

export default defineTool({
	description:
		"Find and store a photograph for a contact, from their LinkedIn profile, their GitHub account, or their employer's own team page — whichever is on the record. Never searches for a face by name. Reports which source it used, or what it tried.",
	inputSchema: z.object({
		contactId: z.string(),
		force: z
			.boolean()
			.default(false)
			.describe("Replace an existing photo. Only when a rep asked."),
	}),
	async execute({ contactId, force }, ctx) {
		assertResearchPurpose(ctx);
		if (!blobEnabled()) {
			return {
				stored: false as const,
				configured: false as const,
				reason:
					"This install has no BLOB_READ_WRITE_TOKEN, so there is nowhere to keep a copy, and " +
					"the source URLs expire. Retrying will not help.",
			};
		}

		return runPortrait({ contactId, spend, force });
	},
});
