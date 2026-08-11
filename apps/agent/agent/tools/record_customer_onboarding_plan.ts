import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

const planItem = z.object({
	name: z.string().trim().min(1).max(240),
	details: z.string().trim().min(1).max(4_000),
	ownerName: z.string().trim().min(1).max(160).optional(),
	confidence: z.enum(["CONFIRMED", "INFERRED", "QUESTION"]),
});

export default defineTool({
	description:
		"Record the systems, data, access, ingestion and decision plan for the dispatched closed-won customer while preserving confirmed facts versus questions.",
	inputSchema: z.object({
		dealId: z.string(),
		objective: z.string().trim().min(1).max(4_000),
		systemsSummary: z.string().trim().min(1).max(12_000),
		dataSummary: z.string().trim().min(1).max(12_000),
		brainPlan: z.string().trim().min(1).max(12_000),
		systems: z.array(planItem).max(30),
		dataSources: z.array(planItem).max(30),
		access: z.array(planItem).max(30),
		ingestion: z.array(planItem).max(30),
		decisions: z.array(planItem).max(20),
	}),
	async execute(input, ctx) {
		const attributes = ctx.session.auth.current?.attributes;
		const taskId =
			typeof attributes?.taskId === "string" ? attributes.taskId : null;
		if (
			attributes?.taskKind !== "customer-onboarding-plan" ||
			attributes.dealId !== input.dealId ||
			!taskId
		) {
			return {
				written: false as const,
				reason: "Not this deal's onboarding task.",
			};
		}
		const task = await db.agentTask.findFirst({
			where: {
				id: taskId,
				kind: "customer-onboarding-plan",
				dealId: input.dealId,
				finishedAt: null,
			},
			select: { id: true },
		});
		if (!task) {
			return {
				written: false as const,
				reason: "The onboarding task is no longer active.",
			};
		}

		const onboarding = await db.customerOnboarding.findUnique({
			where: { dealId: input.dealId },
			select: { id: true, deal: { select: { stage: true } } },
		});
		if (!onboarding || onboarding.deal.stage !== "CLOSED_WON") {
			return {
				written: false as const,
				reason: "Onboarding opens only for a closed-won deal.",
			};
		}

		const groups = [
			["SYSTEM", input.systems],
			["DATA_SOURCE", input.dataSources],
			["ACCESS", input.access],
			["INGESTION", input.ingestion],
			["DECISION", input.decisions],
		] as const;
		await db.$transaction(async (tx) => {
			await tx.customerOnboarding.update({
				where: { id: onboarding.id },
				data: {
					objective: input.objective,
					systemsSummary: input.systemsSummary,
					dataSummary: input.dataSummary,
					brainPlan: input.brainPlan,
					agentPlannedAt: new Date(),
				},
			});
			await tx.onboardingItem.deleteMany({
				where: {
					onboardingId: onboarding.id,
					source: { startsWith: "agent:" },
				},
			});
			let position = 100;
			for (const [kind, items] of groups) {
				for (const item of items) {
					await tx.onboardingItem.create({
						data: {
							onboardingId: onboarding.id,
							kind,
							name: item.name,
							details: item.details,
							ownerName: item.ownerName,
							source: `agent:${item.confidence.toLowerCase()}`,
							position,
						},
					});
					position += 1;
				}
			}
		});

		return {
			written: true as const,
			onboardingId: onboarding.id,
			items: groups.reduce((total, [, items]) => total + items.length, 0),
		};
	},
});
