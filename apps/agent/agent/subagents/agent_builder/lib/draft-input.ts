import { z } from "zod";
import type { DraftAgentInput } from "../../../lib/builder-runtime";

const recordResource = z.object({
	kind: z.enum(["company", "contact", "deal"]),
	id: z.string().min(1),
	label: z.string().min(1).max(120),
});

const trigger = z.object({
	type: z.enum(["MANUAL", "SCHEDULE"]),
	name: z.string().trim().min(1).max(120),
	summary: z.string().trim().min(1).max(240),
	nextRunAt: z.string().nullish(),
	intervalMinutes: z.number().int().min(1).max(525_600).nullish(),
});

const action = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("crm.activity.create"),
		provider: z.literal("crm"),
		summary: z.string().trim().min(1).max(240),
		activityTypes: z
			.array(z.enum(["NOTE", "TASK"]))
			.min(1)
			.max(2),
	}),
	z.object({
		type: z.literal("run.summary"),
		provider: z.literal("crm"),
		summary: z.string().trim().min(1).max(240),
	}),
]);

export const builderDraftToolInput = z.object({
	name: z.string().trim().min(1).max(100),
	description: z.string().trim().min(1).max(320),
	instructions: z.string().trim().min(40).max(20_000),
	trigger,
	recordScope: z.enum(["SELECTED", "WORKSPACE"]),
	resources: z.array(recordResource).max(30),
	integrations: z.array(z.enum(["gmail", "calendar"])).max(2),
	actions: z.array(action).min(1).max(10),
});

type BuilderDraftToolInput = z.infer<typeof builderDraftToolInput>;

const INTEGRATIONS = {
	gmail: { kind: "integration", id: "google:gmail", label: "Gmail" },
	calendar: {
		kind: "integration",
		id: "google:calendar",
		label: "Google Calendar",
	},
} as const;

export function draftInputFromTool(
	input: BuilderDraftToolInput,
): DraftAgentInput {
	const { integrations: requestedIntegrations, ...draft } = input;
	const integrations = [...new Set(requestedIntegrations)];
	const access = [
		input.recordScope === "WORKSPACE"
			? "Read workspace CRM records"
			: "Read selected CRM records",
		...integrations.map((integration) =>
			integration === "gmail"
				? "Read connected Gmail messages"
				: "Read connected Google Calendar events",
		),
	];

	return {
		...draft,
		resources: [
			...input.resources,
			...integrations.map((integration) => INTEGRATIONS[integration]),
		],
		access,
	};
}
