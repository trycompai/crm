import { CRM_EVENT_TYPES } from "@crm/db/crm-events";
import { z } from "zod";

export const AGENT_ACTION_TYPES = {
	CRM_ACTIVITY_CREATE: "crm.activity.create",
	RUN_SUMMARY: "run.summary",
	SLACK_MESSAGE_POST: "slack.message.post",
	SLACK_CHANNEL_OPEN: "slack.channel.open",
	SLACK_CHANNEL_INVITE: "slack.channel.invite",
} as const;

export const SLACK_WORKSPACE_RESOURCE_ID = "slack:workspace";

export type AgentActionType =
	(typeof AGENT_ACTION_TYPES)[keyof typeof AGENT_ACTION_TYPES];

export const AGENT_TRIGGER_INTERVAL_MINUTES = {
	min: 1,
	max: 525_600,
	fallback: 1_440,
} as const;

const slackDestination = z.object({
	kind: z.enum(["channel", "user"]),
	resolution: z.literal("chosen"),
	id: z.string().trim().min(1).max(120),
	label: z.string().trim().min(1).max(120),
});

export const agentManifestAction = z.discriminatedUnion("type", [
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE),
		provider: z.literal("crm"),
		summary: z.string(),
		activityTypes: z
			.array(z.enum(["NOTE", "TASK"]))
			.min(1)
			.max(2),
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.RUN_SUMMARY),
		provider: z.literal("crm"),
		summary: z.string(),
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.SLACK_MESSAGE_POST),
		provider: z.literal("slack"),
		summary: z.string(),
		destination: slackDestination,
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.SLACK_CHANNEL_OPEN),
		provider: z.literal("slack"),
		summary: z.string(),
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.SLACK_CHANNEL_INVITE),
		provider: z.literal("slack"),
		summary: z.string(),
	}),
]);

export const agentScheduleTriggerConfig = z.object({
	nextRunAt: z.string(),
	intervalMinutes: z.number().int().min(AGENT_TRIGGER_INTERVAL_MINUTES.min),
});

export const agentEventTriggerConfig = z.object({
	event: z.enum(CRM_EVENT_TYPES),
});

export const agentManifestTrigger = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("MANUAL"),
		name: z.string(),
		summary: z.string(),
		config: z.object({}),
	}),
	z.object({
		type: z.literal("SCHEDULE"),
		name: z.string(),
		summary: z.string(),
		config: agentScheduleTriggerConfig,
	}),
	z.object({
		type: z.literal("EVENT"),
		name: z.string(),
		summary: z.string(),
		config: agentEventTriggerConfig,
	}),
]);

export const agentManifestResource = z.object({
	id: z.string(),
	kind: z.enum(["company", "contact", "deal", "integration"]),
	label: z.string(),
});

export const agentManifest = z
	.object({
		description: z.string().optional(),
		actions: z.array(agentManifestAction).min(1),
		triggers: z.array(agentManifestTrigger).min(1),
		dataScope: z.object({
			mode: z.enum(["SELECTED", "WORKSPACE"]),
			summary: z.string(),
			resources: z.array(agentManifestResource).default([]),
		}),
	})
	.superRefine((manifest, context) => {
		const actionTypes = new Set<string>();
		for (const [index, action] of manifest.actions.entries()) {
			if (actionTypes.has(action.type)) {
				context.addIssue({
					code: "custom",
					path: ["actions", index, "type"],
					message: `Duplicate ${action.type} action`,
				});
			}
			actionTypes.add(action.type);
		}

		const slack = manifest.actions.findIndex(
			(action) => action.provider === "slack",
		);
		const workspace = manifest.dataScope.resources.some(
			(resource) =>
				resource.kind === "integration" &&
				resource.id === SLACK_WORKSPACE_RESOURCE_ID,
		);
		if (slack >= 0 && !workspace) {
			context.addIssue({
				code: "custom",
				path: ["actions", slack, "provider"],
				message: `A Slack action needs the ${SLACK_WORKSPACE_RESOURCE_ID} resource, or it fails on every run`,
			});
		}
	});

export type SlackDestination = z.infer<typeof slackDestination>;
export type AgentManifestAction = z.infer<typeof agentManifestAction>;
export type AgentManifestTrigger = z.infer<typeof agentManifestTrigger>;
export type AgentManifestResource = z.infer<typeof agentManifestResource>;
export type AgentManifest = z.infer<typeof agentManifest>;

export class InvalidAgentManifest extends Error {
	constructor(readonly issues: string) {
		super(`The deployed version's manifest is unreadable: ${issues}`);
		this.name = "InvalidAgentManifest";
	}
}

export function parseAgentManifest(value: unknown): AgentManifest {
	const parsed = agentManifest.safeParse(value);
	if (parsed.success) return parsed.data;

	throw new InvalidAgentManifest(
		parsed.error.issues
			.map((issue) => `${issue.path.join(".") || "manifest"} ${issue.message}`)
			.join("; "),
	);
}

export const agentTriggerConfig = z.object({
	intervalMinutes: z
		.number()
		.min(AGENT_TRIGGER_INTERVAL_MINUTES.min)
		.transform((minutes) =>
			Math.min(minutes, AGENT_TRIGGER_INTERVAL_MINUTES.max),
		)
		.catch(AGENT_TRIGGER_INTERVAL_MINUTES.fallback),
	event: z.enum(CRM_EVENT_TYPES).nullable().catch(null),
});

export type AgentTriggerConfig = z.infer<typeof agentTriggerConfig>;

const UNREADABLE_TRIGGER_CONFIG: AgentTriggerConfig = {
	intervalMinutes: AGENT_TRIGGER_INTERVAL_MINUTES.fallback,
	event: null,
};

export function readAgentTriggerConfig(value: unknown): AgentTriggerConfig {
	const parsed = agentTriggerConfig.safeParse(value);
	return parsed.success ? parsed.data : UNREADABLE_TRIGGER_CONFIG;
}

const optionalText = z.string().optional().catch(undefined);

export const agentManifestSummary = z.object({
	name: optionalText,
	description: optionalText,
	access: z
		.array(z.string().nullable().catch(null))
		.catch([])
		.transform((entries) => entries.filter((entry) => entry !== null)),
	triggers: z
		.array(z.object({ type: optionalText, summary: optionalText }).catch({}))
		.catch([]),
	actions: z.array(z.object({ summary: optionalText }).catch({})).catch([]),
	dataScope: z.object({ summary: optionalText }).catch({}),
});

export type AgentManifestSummary = z.infer<typeof agentManifestSummary>;

const UNREADABLE_MANIFEST_SUMMARY: AgentManifestSummary = {
	access: [],
	triggers: [],
	actions: [],
	dataScope: {},
};

export function readAgentManifestSummary(value: unknown): AgentManifestSummary {
	const parsed = agentManifestSummary.safeParse(value);
	return parsed.success ? parsed.data : UNREADABLE_MANIFEST_SUMMARY;
}
