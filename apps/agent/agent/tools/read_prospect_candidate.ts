import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
	description:
		"Read one prospect candidate, its evidence, deterministic score and configured product offer before drafting. This never approves or contacts the prospect.",
	inputSchema: z.object({ candidateId: z.string().min(1) }),
	async execute({ candidateId }) {
		const candidate = await db.prospectCandidate.findUnique({
			where: { id: candidateId },
			include: {
				product: {
					select: {
						name: true,
						offerName: true,
						offerPrice: true,
						offerUrl: true,
						defaultLocale: true,
					},
				},
				evidence: {
					orderBy: { observedAt: "desc" },
					select: {
						kind: true,
						detail: true,
						sourceName: true,
						sourceUrl: true,
					},
				},
			},
		});
		return candidate
			? { found: true as const, candidate }
			: { found: false as const, reason: "No such prospect." };
	},
});
