import { AGENT_ACTION_TYPES } from "./agent-actions";
import type { AgentManifest } from "./agent-manifest";
import { parseAgentManifest } from "./agent-manifest";
import type { DraftAgentInput, DraftTrigger } from "./builder-runtime";

export const ADVANCE_LIFECYCLE_ROLE = "advance" as const;

export const ADVANCE_SPECIALIST_NAME = "Advance";

export const ADVANCE_SPECIALIST_DESCRIPTION =
	"Recommend the next stage and next step for open deals using CRM evidence. Recommend only. Never mutate stage unattended.";

export const ADVANCE_SPECIALIST_INSTRUCTIONS = `You are the Advance specialist for this CRM team agent.

Your job is to move open deals forward by recommending the next stage and the next human step.

Rules:
1. Read only CRM records in the approved scope and connected sources listed in the run.
2. Focus on open deals and their linked contacts. Base every claim on CRM evidence you read in this run.
3. Do not invent stakeholders, activity, or stage history that is not in the record.
4. Detect stall from last activity and deal fields. State the gap in plain language.
5. Recommend a next stage only when evidence supports it. Write that recommendation as a CRM task or note. Never change deal stage yourself.
6. Recommend a concrete next step for the owner: who to contact, what to ask, or what is missing.
7. Write only approved CRM notes and tasks. Put the recommendation, the reason, and the evidence references in that note or task.
8. Finish with run.summary. State the recommended stage or next step and what you wrote.
9. Never send email, SMS, or any external outreach. Never promise that a message was delivered.
10. Never change deal stage, amount, ownership, or close state.
11. Stop after one recommendation cycle on the triggering or selected deal.
`;

const ADVANCE_STALL_INTERVAL_MINUTES = 24 * 60;

const ADVANCE_TRIGGERS: DraftTrigger[] = [
	{
		type: "MANUAL",
		name: "Advance selected deal",
		summary: "Run on demand for a tagged open deal",
	},
	{
		type: "EVENT",
		name: "When a deal is opened",
		summary: "Recommend the first next step for a new open deal",
		event: "deal.opened",
	},
	{
		type: "EVENT",
		name: "When a deal stage changes",
		summary: "Recommend the next step after a stage change",
		event: "deal.stage.changed",
	},
	{
		type: "SCHEDULE",
		name: "Daily stall check",
		summary: "Scan open deals for stalled next steps",
		intervalMinutes: ADVANCE_STALL_INTERVAL_MINUTES,
	},
];

const ADVANCE_ACTIONS: DraftAgentInput["actions"] = [
	{
		type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
		provider: "crm",
		summary: "Record the next-step recommendation as a note or owner task",
		activityTypes: ["NOTE", "TASK"],
	},
	{
		type: AGENT_ACTION_TYPES.RUN_SUMMARY,
		provider: "crm",
		summary: "Summarize the recommended stage, next step, and evidence",
	},
];

export const ADVANCE_RECOMMEND_ONLY_ACTION_TYPES = [
	AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
	AGENT_ACTION_TYPES.RUN_SUMMARY,
] as const;

export function isAdvanceRecommendOnlyActionType(type: string): boolean {
	return (ADVANCE_RECOMMEND_ONLY_ACTION_TYPES as readonly string[]).includes(
		type,
	);
}

export function assertAdvanceRecommendOnlyActions(
	actions: ReadonlyArray<{ type: string }>,
): void {
	for (const action of actions) {
		if (!isAdvanceRecommendOnlyActionType(action.type)) {
			throw new Error(
				`Advance specialist forbids action type ${action.type}. Recommend-only CRM note/task and run summary are allowed.`,
			);
		}
	}
}

export type AdvanceDraftOptions = {
	recordScope?: "SELECTED" | "WORKSPACE";
	resources?: DraftAgentInput["resources"];
	name?: string;
	description?: string;
	instructions?: string;
	now?: string;
};

export function advanceSpecialistDraft(
	options: AdvanceDraftOptions = {},
): DraftAgentInput {
	const recordScope = options.recordScope ?? "WORKSPACE";
	const resources = options.resources ?? [];
	const recordResources = resources.filter(
		(resource) => resource.kind !== "integration",
	);

	if (recordScope === "SELECTED" && recordResources.length === 0) {
		throw new Error("Selected Advance draft needs at least one CRM resource.");
	}
	if (recordScope === "WORKSPACE" && recordResources.length > 0) {
		throw new Error("Workspace Advance draft cannot list selected records.");
	}

	const triggers =
		recordScope === "SELECTED"
			? ADVANCE_TRIGGERS.filter((trigger) => trigger.type === "MANUAL")
			: ADVANCE_TRIGGERS.map((trigger) =>
					trigger.type === "SCHEDULE"
						? {
								...trigger,
								nextRunAt: options.now ?? new Date().toISOString(),
							}
						: trigger,
				);

	const draft: DraftAgentInput = {
		name: options.name ?? ADVANCE_SPECIALIST_NAME,
		description: options.description ?? ADVANCE_SPECIALIST_DESCRIPTION,
		instructions: options.instructions ?? ADVANCE_SPECIALIST_INSTRUCTIONS,
		lifecycleRole: ADVANCE_LIFECYCLE_ROLE,
		triggers,
		recordScope,
		resources,
		actions: ADVANCE_ACTIONS,
		access: [
			recordScope === "WORKSPACE"
				? "Read workspace CRM records"
				: "Read selected CRM records",
			"Write notes on CRM records",
			"Create tasks on CRM records",
		],
	};

	assertAdvanceRecommendOnlyActions(draft.actions);
	return draft;
}

export function advanceSpecialistManifest(
	options: AdvanceDraftOptions = {},
): AgentManifest {
	const draft = advanceSpecialistDraft(options);
	const now = options.now ?? new Date().toISOString();
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
					? "Workspace open deals for advance recommendations"
					: "Selected deals for manual advance recommendations",
			resources: draft.resources,
		},
		actions: draft.actions,
		access: draft.access,
	};

	return parseAgentManifest(manifest);
}
