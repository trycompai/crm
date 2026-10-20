import { CRM_EVENT_TYPES } from "@crm/db/crm-events";
import { z } from "zod";

export const AGENT_ACTION_TYPES = {
	CRM_ACTIVITY_CREATE: "crm.activity.create",
	RUN_SUMMARY: "run.summary",
	SLACK_MESSAGE_POST: "slack.message.post",
} as const;

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

export const agentManifestMcpTool = z.object({
	name: z.string().trim().min(1).max(256),
	fingerprint: z.string().length(64),
	callKind: z.enum(["read", "change", "risky"]),
	summary: z.string().trim().min(1).max(240),
});

export const agentManifestMcpGrant = z.object({
	platformSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
	summary: z.string().trim().min(1).max(240),
	tools: z.array(agentManifestMcpTool).min(1).max(1_000),
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
		mcp: z.array(agentManifestMcpGrant).max(50).default([]),
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

		const platforms = new Set<string>();
		for (const [grantIndex, grant] of manifest.mcp.entries()) {
			if (platforms.has(grant.platformSlug)) {
				context.addIssue({
					code: "custom",
					path: ["mcp", grantIndex, "platformSlug"],
					message: `Duplicate ${grant.platformSlug} MCP grant`,
				});
			}
			platforms.add(grant.platformSlug);

			const tools = new Set<string>();
			for (const [toolIndex, tool] of grant.tools.entries()) {
				if (tools.has(tool.name)) {
					context.addIssue({
						code: "custom",
						path: ["mcp", grantIndex, "tools", toolIndex, "name"],
						message: `Duplicate ${tool.name} MCP tool grant`,
					});
				}
				tools.add(tool.name);
			}
		}
	});

export type SlackDestination = z.infer<typeof slackDestination>;
export type AgentManifestAction = z.infer<typeof agentManifestAction>;
export type AgentManifestTrigger = z.infer<typeof agentManifestTrigger>;
export type AgentManifestResource = z.infer<typeof agentManifestResource>;
export type AgentManifestMcpGrant = z.infer<typeof agentManifestMcpGrant>;
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
