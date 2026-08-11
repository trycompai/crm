import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { domainOf } from "../lib/prospect-promotion";

const candidate = z.object({
	companyName: z.string().trim().min(1).max(200),
	website: z.string().trim().url(),
	location: z.string().trim().min(1).max(200).optional(),
	country: z.enum(["Australia", "United Kingdom", "United States"]),
	countryCode: z.enum(["AU", "GB", "US"]),
	region: z.string().trim().min(1).max(120),
	sourceUrl: z.string().trim().url(),
	publicSignal: z.string().trim().min(1).max(1_500),
	whyNow: z.string().trim().min(1).max(1_500),
});

export default defineTool({
	description:
		"Record a deduplicated batch of public-signal company candidates from an active lead-discovery task and queue every newly retained prospect for full evidence, job-posting and named-contact research.",
	inputSchema: z.object({ candidates: z.array(candidate).min(1).max(100) }),
	async execute({ candidates }, ctx) {
		const attributes = ctx.session.auth.current?.attributes;
		const taskId =
			typeof attributes?.taskId === "string" ? attributes.taskId : null;
		if (attributes?.taskKind !== "lead-discovery" || !taskId) {
			return {
				written: 0,
				duplicates: 0,
				reason: "Not a lead-discovery task.",
			};
		}
		const task = await db.agentTask.findFirst({
			where: {
				id: taskId,
				kind: "lead-discovery",
				finishedAt: null,
			},
			select: { id: true, budget: true, reason: true },
		});
		if (!task) {
			return {
				written: 0,
				duplicates: 0,
				reason: "The discovery task is no longer active.",
			};
		}
		const allowedCountries = (["AU", "GB", "US"] as const).filter((code) =>
			task.reason.includes(code),
		);
		const limit = Math.min(task.budget, 100);

		let written = 0;
		let duplicates = 0;
		const prospectIds: string[] = [];
		for (const item of candidates.slice(0, limit)) {
			if (!allowedCountries.includes(item.countryCode)) {
				duplicates += 1;
				continue;
			}
			const domain = domainOf(item.website);
			if (!domain) continue;
			const dedupeKey = `${item.countryCode}:${domain}`;
			const [existingProspect, existingCompany] = await Promise.all([
				db.prospect.findUnique({
					where: { dedupeKey },
					select: { id: true },
				}),
				db.company.findUnique({
					where: { domain },
					select: { id: true },
				}),
			]);
			if (existingProspect || existingCompany) {
				duplicates += 1;
				continue;
			}

			try {
				const prospectId = await db.$transaction(async (tx) => {
					const prospect = await tx.prospect.create({
						data: {
							dedupeKey,
							region: item.region,
							country: item.country,
							countryCode: item.countryCode,
							companyName: item.companyName,
							website: item.website,
							location: item.location,
							status: "RESEARCHING",
							enrichmentStatus: "PENDING",
							companyProof: item.publicSignal,
							whyNow: item.whyNow,
							sourceBatch: `agent:${task.id}`,
							sourceUrl: item.sourceUrl,
						},
						select: { id: true },
					});
					await tx.agentTask.create({
						data: {
							prospectId: prospect.id,
							kind: "prospect-research",
							reason:
								"New public-signal candidate from one-click lead discovery",
							dueAt: new Date(),
							priority: PRIORITY.prospectResearch,
							budget: 10,
						},
					});
					return prospect.id;
				});
				prospectIds.push(prospectId);
				written += 1;
			} catch (error) {
				if (isUniqueConflict(error)) {
					duplicates += 1;
					continue;
				}
				throw error;
			}
		}

		return { written, duplicates, queuedForResearch: prospectIds.length };
	},
});

function isUniqueConflict(error: unknown): boolean {
	return Boolean(
		typeof error === "object" &&
			error &&
			"code" in error &&
			(error as { code?: unknown }).code === "P2002",
	);
}
