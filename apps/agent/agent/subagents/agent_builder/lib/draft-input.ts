import { CRM_EVENT_TYPES } from "@crm/db/crm-events";
import {
	AGENT_ACTION_TYPES,
	slackDestination,
} from "@crm/validation/agent-manifest";
import { z } from "zod";
import type { DraftAgentInput } from "../../../lib/builder-runtime";

const recordResource = z.object({
	kind: z.enum(["company", "contact", "deal"]),
	id: z.string().min(1),
	label: z.string().min(1).max(120),
});

const triggerMetadata = {
	name: z.string().trim().min(1).max(120),
	summary: z.string().trim().min(1).max(240),
};

const trigger = z.discriminatedUnion("type", [
	z.object({ type: z.literal("MANUAL"), ...triggerMetadata }),
	z.object({
		type: z.literal("SCHEDULE"),
		...triggerMetadata,
		nextRunAt: z.string(),
		intervalMinutes: z.number().int().min(1).max(525_600),
	}),
	z.object({
		type: z.literal("EVENT"),
		...triggerMetadata,
		event: z.enum(CRM_EVENT_TYPES),
	}),
]);

const action = z.discriminatedUnion("type", [
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE),
		provider: z.literal("crm"),
		summary: z.string().trim().min(1).max(240),
		activityTypes: z
			.array(z.enum(["NOTE", "TASK"]))
			.min(1)
			.max(2),
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.RUN_SUMMARY),
		provider: z.literal("crm"),
		summary: z.string().trim().min(1).max(240),
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.SLACK_MESSAGE_POST),
		provider: z.literal("slack"),
		summary: z.string().trim().min(1).max(240),
		destination: slackDestination,
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.SLACK_CHANNEL_OPEN),
		provider: z.literal("slack"),
		summary: z.string().trim().min(1).max(240),
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.SLACK_CHANNEL_INVITE),
		provider: z.literal("slack"),
		summary: z.string().trim().min(1).max(240),
	}),
]);

export type DraftAction = z.infer<typeof action>;

export const builderDraftToolInput = z.object({
	name: z.string().trim().min(1).max(100),
	description: z.string().trim().min(1).max(320),
	instructions: z.string().trim().min(40).max(20_000),
	triggers: z.array(trigger).min(1).max(10),
	recordScope: z.enum(["SELECTED", "WORKSPACE"]),
	resources: z.array(recordResource).max(30),
	integrations: z.array(z.enum(["gmail", "calendar", "slack"])).max(3),
	actions: z.array(action).min(1).max(10),
});

type BuilderDraftToolInput = z.infer<typeof builderDraftToolInput>;

const ACTIVITY_ACCESS = {
	NOTE: "Write notes on CRM records",
	TASK: "Create tasks on CRM records",
} as const;

const ACTIVITY_ORDER = ["NOTE", "TASK"] as const;

const SLACK_ACCESS = {
	[AGENT_ACTION_TYPES.SLACK_MESSAGE_POST]:
		"Post to approved Slack destinations",
	[AGENT_ACTION_TYPES.SLACK_CHANNEL_OPEN]: "Open Slack channels",
	[AGENT_ACTION_TYPES.SLACK_CHANNEL_INVITE]: "Invite people to Slack channels",
} as const;

const SLACK_ORDER = [
	AGENT_ACTION_TYPES.SLACK_MESSAGE_POST,
	AGENT_ACTION_TYPES.SLACK_CHANNEL_OPEN,
	AGENT_ACTION_TYPES.SLACK_CHANNEL_INVITE,
] as const;

const INTEGRATIONS = {
	gmail: { kind: "integration", id: "google:gmail", label: "Gmail" },
	calendar: {
		kind: "integration",
		id: "google:calendar",
		label: "Google Calendar",
	},
	slack: { kind: "integration", id: "slack:workspace", label: "Slack" },
} as const;

export function draftInputFromTool(
	input: BuilderDraftToolInput,
): DraftAgentInput {
	const { integrations: requestedIntegrations, ...draft } = input;
	const integrations = [...new Set(requestedIntegrations)];
	const activityTypes = new Set(
		input.actions.flatMap((entry) =>
			entry.type === AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE
				? entry.activityTypes
				: [],
		),
	);
	const slackTypes = new Set(input.actions.map((entry) => entry.type));
	const access = [
		input.recordScope === "WORKSPACE"
			? "Read workspace CRM records"
			: "Read selected CRM records",
		...integrations.flatMap((integration) => {
			if (integration === "gmail") return ["Read connected Gmail messages"];
			if (integration === "calendar") {
				return ["Read connected Google Calendar events"];
			}
			const lines = SLACK_ORDER.filter((type) => slackTypes.has(type)).map(
				(type) => SLACK_ACCESS[type],
			);
			return lines.length > 0 ? lines : ["Post to approved Slack destinations"];
		}),
		...ACTIVITY_ORDER.filter((type) => activityTypes.has(type)).map(
			(type) => ACTIVITY_ACCESS[type],
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
