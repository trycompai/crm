import { db } from "@crm/db";
import { enrolContact } from "@crm/db/marketing";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { sensitiveWrite } from "../lib/approval";

export default defineTool({
	description:
		"Put one contact into a campaign a person has already activated. Refused with a reason if they are already in it, have walked it before, or their address is suppressed.",
	inputSchema: z.object({
		campaignId: z.string().min(1),
		contactId: z.string().min(1),
	}),
	approval: sensitiveWrite("Ask the rep to enrol them."),
	async execute(input) {
		const campaign = await db.marketingCampaign.findUnique({
			where: { id: input.campaignId },
			select: { status: true },
		});

		if (campaign?.status !== "ACTIVE") {
			return {
				error:
					"That campaign is not live. A person activates a campaign before anybody is enrolled.",
			};
		}

		const result = await enrolContact(db, input.campaignId, input.contactId);
		return result.ok ? result : { error: result.reason };
	},
});
