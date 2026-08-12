export const AGENT_ACTION_TYPES = {
	CRM_ACTIVITY_CREATE: "crm.activity.create",
	RUN_SUMMARY: "run.summary",
	SLACK_MESSAGE_POST: "slack.message.post",
} as const;

export type AgentActionType =
	(typeof AGENT_ACTION_TYPES)[keyof typeof AGENT_ACTION_TYPES];

export const AGENT_ACTION_EXECUTORS = {
	[AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE]: "create_crm_activity",
	[AGENT_ACTION_TYPES.RUN_SUMMARY]: "finish_run",
	[AGENT_ACTION_TYPES.SLACK_MESSAGE_POST]: "post_slack_message",
} as const satisfies Record<AgentActionType, string>;

export function isAgentActionType(value: unknown): value is AgentActionType {
	return Object.hasOwn(AGENT_ACTION_EXECUTORS, String(value));
}

export type AgentActionDependency = {
	readonly id: string;
	readonly label: string;
	readonly resourceId: string;
	readonly fix: string;
};

export const AGENT_ACTION_DEPENDENCIES = {
	[AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE]: null,
	[AGENT_ACTION_TYPES.RUN_SUMMARY]: null,
	[AGENT_ACTION_TYPES.SLACK_MESSAGE_POST]: {
		id: "slack",
		label: "Slack",
		resourceId: "slack:workspace",
		fix: "Connect Slack in Settings → Connections.",
	},
} as const satisfies Record<AgentActionType, AgentActionDependency | null>;

export function actionDependency(
	type: AgentActionType,
): AgentActionDependency | null {
	return AGENT_ACTION_DEPENDENCIES[type];
}
