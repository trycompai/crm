import { db } from "@crm/db";
import {
	MAX_LINE,
	MAX_NARRATIVE,
	writeWorkspaceProfile,
} from "@crm/db/workspace";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { currentFocus } from "../lib/focus";
import { assertResearchPurpose } from "../lib/session-purpose";
import { identity } from "../lib/workspace";

const line = (what: string) =>
	z.string().max(MAX_LINE).optional().describe(what);

export default defineTool({
	description:
		"Write the short profile of the company we work for. Every other session opens with it, so it is deliberately small: a few sentences and three one-line facts. Replaces the previous one.",
	inputSchema: z.object({
		narrative: z
			.string()
			.max(MAX_NARRATIVE)
			.describe(
				"Two or three sentences a new colleague would need on their first day: " +
					"what this company does and how it makes money. Plain, factual, no " +
					"adjectives from the marketing site.",
			),
		sells: line(
			'What we sell, in a few words. e.g. "Compliance automation for SOC 2, ISO 27001 and GDPR"',
		),
		sellsTo: line(
			'Who we sell it to. e.g. "Series A–C startups that need a framework audit"',
		),
		edge: line(
			"What customers pick us over the alternatives for, if the site says.",
		),
		sourceUrl: z.string().optional(),
	}),
	async execute(input, ctx) {
		assertResearchPurpose(ctx);
		const us = await identity();

		if (!us?.website) {
			return {
				written: false as const,
				reason:
					"This install has not been told its own website, so there is nothing to file a profile against.",
			};
		}

		const narrative = input.narrative.trim();

		if (narrative.length < 40) {
			return {
				written: false as const,
				reason:
					"Too short to tell anybody anything. Say what we sell and to whom, or say nothing.",
			};
		}

		const profile = await writeWorkspaceProfile(db, {
			website: us.website,
			narrative,
			sections: {
				sells: input.sells,
				sellsTo: input.sellsTo,
				edge: input.edge,
			},
			sourceUrl: input.sourceUrl,
			sessionId: currentFocus().sessionId,
		});

		return {
			written: true as const,
			website: profile.website,
			narrative: profile.narrative,
			sections: profile.sections,
		};
	},
});
