import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
	description:
		"What marketing email one contact has had, and what they did with it. Use this before suggesting another send. Free.",
	inputSchema: z.object({ contactId: z.string().min(1) }),
	async execute(input) {
		const [sends, recipient] = await Promise.all([
			db.marketingSend.findMany({
				where: { contactId: input.contactId },
				select: {
					subject: true,
					status: true,
					sentAt: true,
					openedAt: true,
					clickedAt: true,
					repliedAt: true,
					campaign: { select: { id: true, name: true } },
				},
				orderBy: { createdAt: "desc" },
				take: 25,
			}),
			db.marketingRecipient.findFirst({
				where: { contactId: input.contactId },
				select: { status: true, statusReason: true, lastSentAt: true },
			}),
		]);

		return {
			subscription: recipient?.status ?? "no marketing record yet",
			reason: recipient?.statusReason ?? null,
			lastSentAt: recipient?.lastSentAt ?? null,
			sends,
		};
	},
});
