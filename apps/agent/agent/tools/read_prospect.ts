import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
	description:
		"Read one prospect, its conversion links and every retained public source before researching or recording it.",
	inputSchema: z.object({ prospectId: z.string() }),
	async execute({ prospectId }, ctx) {
		const attributes = ctx.session.auth.current?.attributes;
		if (
			attributes?.taskKind === "prospect-research" &&
			attributes.prospectId !== prospectId
		) {
			return { found: false as const };
		}
		const prospect = await db.prospect.findUnique({
			where: { id: prospectId },
			include: {
				evidence: {
					orderBy: { createdAt: "desc" },
					include: {
						receipt: {
							select: {
								fetchedAt: true,
								finalUrl: true,
								statusCode: true,
								contentHash: true,
							},
						},
					},
				},
				company: { select: { id: true, name: true, domain: true } },
				contact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						title: true,
						email: true,
						linkedinUrl: true,
					},
				},
			},
		});

		if (!prospect) return { found: false as const };

		return {
			found: true as const,
			prospect: {
				...prospect,
				lastResearchedAt: prospect.lastResearchedAt?.toISOString() ?? null,
				nextResearchAt: prospect.nextResearchAt?.toISOString() ?? null,
				suppressionCheckedAt:
					prospect.suppressionCheckedAt?.toISOString() ?? null,
				promotedAt: prospect.promotedAt?.toISOString() ?? null,
				createdAt: prospect.createdAt.toISOString(),
				updatedAt: prospect.updatedAt.toISOString(),
				enrichedAt: prospect.enrichedAt?.toISOString() ?? null,
				evidence: prospect.evidence.map((evidence) => ({
					...evidence,
					signalDate: evidence.signalDate?.toISOString() ?? null,
					createdAt: evidence.createdAt.toISOString(),
					receipt: evidence.receipt
						? {
								...evidence.receipt,
								fetchedAt: evidence.receipt.fetchedAt.toISOString(),
							}
						: null,
				})),
			},
		};
	},
});
