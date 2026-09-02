import {
	AGENT_ACTION_TYPES,
	type AgentActionType,
	SLACK_WORKSPACE_RESOURCE_ID,
} from "@crm/validation/agent-manifest";

export const AGENT_ACTION_EXECUTORS = {
	[AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE]: "create_crm_activity",
	[AGENT_ACTION_TYPES.RUN_SUMMARY]: "finish_run",
	[AGENT_ACTION_TYPES.SLACK_MESSAGE_POST]: "post_slack_message",
	[AGENT_ACTION_TYPES.SLACK_CHANNEL_OPEN]: "open_slack_channel",
	[AGENT_ACTION_TYPES.SLACK_CHANNEL_INVITE]: "invite_to_slack_channel",
} as const satisfies Record<AgentActionType, string>;

export function isAgentActionType(value: string): value is AgentActionType {
	return Object.hasOwn(AGENT_ACTION_EXECUTORS, value);
}

export type AgentActionDependencyId = "slack";

export type AgentActionDependency = {
	readonly id: AgentActionDependencyId;
	readonly label: string;
	readonly resourceId: string;
	readonly fix: string;
	readonly needs: string;
};

const SLACK_DEPENDENCY = {
	id: "slack",
	label: "Slack",
	resourceId: SLACK_WORKSPACE_RESOURCE_ID,
	fix: "Connect Slack in Settings → Connections.",
} as const;

export const AGENT_ACTION_DEPENDENCIES = {
	[AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE]: null,
	[AGENT_ACTION_TYPES.RUN_SUMMARY]: null,
	[AGENT_ACTION_TYPES.SLACK_MESSAGE_POST]: {
		...SLACK_DEPENDENCY,
		needs: "Posting to Slack",
	},
	[AGENT_ACTION_TYPES.SLACK_CHANNEL_OPEN]: {
		...SLACK_DEPENDENCY,
		needs: "Opening a Slack channel",
	},
	[AGENT_ACTION_TYPES.SLACK_CHANNEL_INVITE]: {
		...SLACK_DEPENDENCY,
		needs: "Inviting people to a Slack channel",
	},
} as const satisfies Record<AgentActionType, AgentActionDependency | null>;

export function actionDependency(
	type: AgentActionType,
): AgentActionDependency | null {
	return AGENT_ACTION_DEPENDENCIES[type];
}
