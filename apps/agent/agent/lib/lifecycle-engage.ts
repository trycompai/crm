import { AGENT_ACTION_TYPES } from "./agent-actions";
import type { AgentManifest } from "./agent-manifest";
import { parseAgentManifest } from "./agent-manifest";
import type { DraftAgentInput, DraftTrigger } from "./builder-runtime";

export const ENGAGE_LIFECYCLE_ROLE = "engage" as const;

export const ENGAGE_SPECIALIST_NAME = "Engage";

export const ENGAGE_SPECIALIST_DESCRIPTION =
	"Recommend the next outreach for a selected person or company. Queue notes and tasks only. Never send email or SMS.";

export const ENGAGE_SPECIALIST_INSTRUCTIONS = `You are the Engage specialist for this CRM team agent.

Your job is to recommend the next outreach and queue the work for a human.

Rules:
1. Read only CRM records in the approved scope and connected sources listed in the run.
2. Base every claim on CRM evidence you read in this run. Do not invent history, titles, or relationship facts.
3. Treat seller policy as external human config when available. If seller rules are missing, say so and stop inventing policy.
4. Recommend one next outreach: channel, audience, subject or opener, body draft, and why.
5. Write only approved CRM notes and tasks. Put the recommendation, the reason, and the evidence references in that note or task.
6. Finish with run.summary. State the recommendation and what you queued.
7. Never send email, SMS, LinkedIn messages, or any external outreach. Never promise that a message was delivered.
8. Never change deal stage or ownership.
9. Stop after one recommendation cycle on the triggering or selected record.
`;

const ENGAGE_TRIGGERS: DraftTrigger[] = [
	{
		type: "MANUAL",
		name: "Recommend next outreach",
		summary: "Run on demand for a tagged contact, company, or deal",
	},
	{
		type: "EVENT",
		name: "When a deal is opened",
		summary: "Recommend first-touch outreach for a newly opened deal",
		event: "deal.opened",
	},
	{
		type: "EVENT",
		name: "When a deal stage changes",
		summary: "Recommend follow-up outreach after a stage change",
		event: "deal.stage.changed",
	},
];

const ENGAGE_ACTIONS: DraftAgentInput["actions"] = [
	{
		type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
		provider: "crm",
		summary: "Queue the outreach recommendation as a note or owner task",
		activityTypes: ["NOTE", "TASK"],
	},
	{
		type: AGENT_ACTION_TYPES.RUN_SUMMARY,
		provider: "crm",
		summary: "Summarize the recommended outreach and what was queued",
	},
];

export const ENGAGE_RECOMMEND_ONLY_ACTION_TYPES = [
	AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
	AGENT_ACTION_TYPES.RUN_SUMMARY,
] as const;

export function isEngageRecommendOnlyActionType(type: string): boolean {
	return (ENGAGE_RECOMMEND_ONLY_ACTION_TYPES as readonly string[]).includes(
		type,
	);
}

export function assertEngageRecommendOnlyActions(
	actions: ReadonlyArray<{ type: string }>,
): void {
	for (const action of actions) {
		if (!isEngageRecommendOnlyActionType(action.type)) {
			throw new Error(
				`Engage specialist forbids action type ${action.type}. Recommend-only CRM note/task and run summary are allowed.`,
			);
		}
	}
}

export type EngageDraftOptions = {
	recordScope?: "SELECTED" | "WORKSPACE";
	resources?: DraftAgentInput["resources"];
	name?: string;
	description?: string;
	instructions?: string;
};

export function engageSpecialistDraft(
	options: EngageDraftOptions = {},
): DraftAgentInput {
	const recordScope = options.recordScope ?? "SELECTED";
	const resources = options.resources ?? [];
	const recordResources = resources.filter(
		(resource) => resource.kind !== "integration",
	);

	if (recordScope === "SELECTED" && recordResources.length === 0) {
		throw new Error("Selected Engage draft needs at least one CRM resource.");
	}
	if (recordScope === "WORKSPACE" && recordResources.length > 0) {
		throw new Error("Workspace Engage draft cannot list selected records.");
	}

	const triggers =
		recordScope === "SELECTED"
			? ENGAGE_TRIGGERS.filter((trigger) => trigger.type === "MANUAL")
			: ENGAGE_TRIGGERS;

	const draft: DraftAgentInput = {
		name: options.name ?? ENGAGE_SPECIALIST_NAME,
		description: options.description ?? ENGAGE_SPECIALIST_DESCRIPTION,
		instructions: options.instructions ?? ENGAGE_SPECIALIST_INSTRUCTIONS,
		lifecycleRole: ENGAGE_LIFECYCLE_ROLE,
		triggers,
		recordScope,
		resources,
		actions: ENGAGE_ACTIONS,
		access: [
			recordScope === "WORKSPACE"
				? "Read workspace CRM records"
				: "Read selected CRM records",
			"Write notes on CRM records",
			"Create tasks on CRM records",
		],
	};

	assertEngageRecommendOnlyActions(draft.actions);
	return draft;
}

export function engageSpecialistManifest(
	options: EngageDraftOptions = {},
): AgentManifest {
	const draft = engageSpecialistDraft(options);
	const now = new Date().toISOString();
	const manifest = {
		kind: "crm-team-agent",
		name: draft.name,
		description: draft.description,
		lifecycleRole: draft.lifecycleRole,
		triggers: draft.triggers.map((trigger) => ({
			type: trigger.type,
			name: trigger.name,
			summary: trigger.summary,
			config:
				trigger.type === "SCHEDULE"
					? {
							intervalMinutes: trigger.intervalMinutes,
							nextRunAt: trigger.nextRunAt ?? now,
						}
					: trigger.type === "EVENT"
						? { event: trigger.event }
						: {},
		})),
		dataScope: {
			mode: draft.recordScope,
			summary:
				draft.recordScope === "WORKSPACE"
					? "Workspace CRM records for outreach recommendations"
					: "Selected CRM records for manual outreach recommendations",
			resources: draft.resources,
		},
		actions: draft.actions,
		access: draft.access,
	};

	return parseAgentManifest(manifest);
}
