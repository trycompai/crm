import type { AgentDefinitionStatus } from "@crm/db/enums";

export const TEAM_AGENT_STATUSES = ["LIVE", "PAUSED", "ARCHIVED"] as const;

export function isPrivateAgentDraft(status: AgentDefinitionStatus): boolean {
	return status === "DRAFT" || status === "DEPLOYING";
}

export function canReadAgent(
	status: AgentDefinitionStatus,
	createdById: string,
	userId: string,
): boolean {
	return !isPrivateAgentDraft(status) || createdById === userId;
}
