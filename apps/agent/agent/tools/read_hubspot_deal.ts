import { defineTool } from "eve/tools";
import { z } from "zod";
import { unavailable } from "../lib/capabilities";
import { HUBSPOT_CAPABILITY } from "../lib/hubspot-config";
import { hubspotConnected } from "../lib/hubspot-connection";
import { hubspotPipelineSummary, readHubspotDeal } from "../lib/hubspot-deals";

export default defineTool({
	description:
		"Read one HubSpot deal by its HubSpot record id, with the pipeline it sits in and what every stage of that pipeline means. Use this when you already hold a HubSpot deal id and need the outcome, the amount or the closed reason. Free.",
	inputSchema: z.object({
		dealId: z.string().trim().min(1).describe("The HubSpot deal record id."),
		withPipeline: z
			.boolean()
			.default(false)
			.describe(
				"Also return every stage of the deal's pipeline and which of them mean won, lost or open.",
			),
	}),
	async execute(input) {
		if (!(await hubspotConnected())) {
			return unavailable(HUBSPOT_CAPABILITY);
		}

		const deal = await readHubspotDeal(input.dealId);
		if (!deal.ok) {
			return { ok: false as const, configured: true, reason: deal.reason };
		}

		if (!deal.body) {
			return {
				ok: false as const,
				configured: true,
				reason: `HubSpot has no deal with id ${input.dealId}.`,
			};
		}

		if (!input.withPipeline) {
			return { ok: true as const, deal: deal.body, pipeline: null };
		}

		const pipelines = await hubspotPipelineSummary();

		return {
			ok: true as const,
			deal: deal.body,
			pipeline: pipelines.ok
				? (pipelines.body.find(
						(pipeline) => pipeline.id === deal.body?.pipeline.id,
					) ?? null)
				: null,
		};
	},
});
