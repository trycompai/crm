import { CRM_EVENT_TYPES } from "@crm/db/crm-events";
import { z } from "zod";
import { AGENT_ACTION_TYPES } from "./agent-actions";

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
		config: z.object({
			nextRunAt: z.string(),
			intervalMinutes: z.number().int().min(1),
		}),
	}),
	z.object({
		type: z.literal("EVENT"),
		name: z.string(),
		summary: z.string(),
		config: z.object({ event: z.enum(CRM_EVENT_TYPES) }),
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
	});

export type SlackDestination = z.infer<typeof slackDestination>;
export type AgentManifestAction = z.infer<typeof agentManifestAction>;
export type AgentManifestTrigger = z.infer<typeof agentManifestTrigger>;
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
