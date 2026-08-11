import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assignedVariant, OUTREACH_EXPERIMENT } from "../lib/outreach";

export default defineTool({
	description:
		"Read the fixed experiment assignment and qualified prospect facts before composing an outreach sequence.",
	inputSchema: z.object({ prospectId: z.string() }),
	async execute({ prospectId }, ctx) {
		const attributes = ctx.session.auth.current?.attributes;
		if (
			attributes?.taskKind !== "outreach-compose" ||
			attributes.prospectId !== prospectId
		) {
			return { found: false as const };
		}
		const prospect = await db.prospect.findUnique({
			where: { id: prospectId },
			select: {
				id: true,
				companyName: true,
				website: true,
				painSignal: true,
				whyFit: true,
				whyNow: true,
				jobDayProblem: true,
				personalHook: true,
				namedPerson: true,
				role: true,
				routeEmail: true,
				draftSubject: true,
				draftBody: true,
				evidence: {
					orderBy: { signalDate: "desc" },
					take: 8,
					select: {
						sourceType: true,
						title: true,
						url: true,
						signalDate: true,
						observed: true,
						summary: true,
					},
				},
			},
		});
		if (!prospect) return { found: false as const };
		return {
			found: true as const,
			experimentKey: OUTREACH_EXPERIMENT,
			variant: assignedVariant(prospectId),
			variantBrief: {
				A: "Lead with the observed job-day pain and ask one diagnostic question.",
				B: "Lead with the current official job or growth signal and connect it to operational load.",
				C: "Lead with the contrast between fragmented tools and one practical operating brain.",
			},
			prospect: {
				...prospect,
				evidence: prospect.evidence.map((item) => ({
					...item,
					signalDate: item.signalDate?.toISOString() ?? null,
				})),
			},
		};
	},
});
