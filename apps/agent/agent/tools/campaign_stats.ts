import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
	description:
		"How a campaign is delivering: sent, delivered, bounced, complained, and the rates. Say the bounce and complaint rates out loud when they are high — over 2% bounces or 0.1% complaints is worth acting on. Free.",
	inputSchema: z.object({ campaignId: z.string().min(1) }),
	async execute(input) {
		const [sent, delivered, bounced, complained, unsubscribed] =
			await Promise.all([
				db.marketingSend.count({
					where: {
						campaignId: input.campaignId,
						status: { in: ["SENT", "DELIVERED", "BOUNCED", "COMPLAINED"] },
					},
				}),
				db.marketingSend.count({
					where: { campaignId: input.campaignId, status: "DELIVERED" },
				}),
				db.marketingSend.count({
					where: { campaignId: input.campaignId, status: "BOUNCED" },
				}),
				db.marketingSend.count({
					where: { campaignId: input.campaignId, status: "COMPLAINED" },
				}),
				db.marketingEvent.count({
					where: {
						type: "UNSUBSCRIBED",
						send: { campaignId: input.campaignId },
					},
				}),
			]);

		return {
			sent,
			delivered,
			bounced,
			complained,
			unsubscribed,
			bounceRate: sent > 0 ? bounced / sent : 0,
			complaintRate: sent > 0 ? complained / sent : 0,
		};
	},
});
