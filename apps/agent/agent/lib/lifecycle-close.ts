import { AGENT_ACTION_TYPES } from "./agent-actions";
import type { AgentManifest } from "./agent-manifest";
import { parseAgentManifest } from "./agent-manifest";
import type { DraftAgentInput, DraftTrigger } from "./builder-runtime";

export const CLOSE_LIFECYCLE_ROLE = "close" as const;

export const CLOSE_SPECIALIST_NAME = "Close";

export const CLOSE_SPECIALIST_DESCRIPTION =
	"Win/loss hygiene, handoff notes, and closed-deal checklist under seller rules. Recommend only. Never send outreach or reopen deals.";

export const CLOSE_SPECIALIST_INSTRUCTIONS = `You are the Close specialist for this CRM team agent.

Your job is win/loss hygiene, handoff notes, closed-won or closed-lost checklist items, and disqualify recommendations under seller rules.

Rules:
1. Read only CRM records in the approved scope and connected sources listed in the run.
2. Base every claim on CRM evidence you read in this run. Do not invent outcomes, revenue, or reasons.
3. Treat seller policy as external human config when available. If seller rules are missing, say so and stop inventing policy.
4. Produce a clear close recommendation: closed-won checklist, closed-lost or disqualify reason, handoff notes for the next owner, or needs human judgment.
5. Write only approved CRM notes and tasks. Put the recommendation, the reason, and the evidence references in that note or task.
6. Finish with run.summary. State the recommendation and what you wrote.
7. Never send email, SMS, Slack, or any external outreach. Never promise that a message was delivered.
8. Never reopen a deal. Never change deal stage, amount, currency, or ownership. Never write finance fields.
9. Stop after one decision cycle on the triggering or selected record.
`;

const CLOSE_TRIGGERS: DraftTrigger[] = [
	{
		type: "MANUAL",
		name: "Close selected deal",
		summary: "Run on demand for a tagged closed or closing deal",
	},
	{
		type: "EVENT",
		name: "When a deal is closed",
		summary: "Win/loss hygiene and handoff notes for a closed deal",
		event: "deal.closed",
	},
];

const CLOSE_ACTIONS: DraftAgentInput["actions"] = [
	{
		type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
		provider: "crm",
		summary: "Record the close recommendation as a note or owner task",
		activityTypes: ["NOTE", "TASK"],
	},
	{
		type: AGENT_ACTION_TYPES.RUN_SUMMARY,
		provider: "crm",
		summary: "Summarize the close recommendation and evidence",
	},
];

export const CLOSE_RECOMMEND_ONLY_ACTION_TYPES = [
	AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
	AGENT_ACTION_TYPES.RUN_SUMMARY,
] as const;

export function isCloseRecommendOnlyActionType(type: string): boolean {
	return (CLOSE_RECOMMEND_ONLY_ACTION_TYPES as readonly string[]).includes(
		type,
	);
}

export function assertCloseRecommendOnlyActions(
	actions: ReadonlyArray<{ type: string }>,
): void {
	for (const action of actions) {
		if (!isCloseRecommendOnlyActionType(action.type)) {
			throw new Error(
				`Close specialist forbids action type ${action.type}. Recommend-only CRM note/task and run summary are allowed.`,
			);
		}
	}
}

export type CloseDraftOptions = {
	recordScope?: "SELECTED" | "WORKSPACE";
	resources?: DraftAgentInput["resources"];
	name?: string;
	description?: string;
	instructions?: string;
};

export function closeSpecialistDraft(
	options: CloseDraftOptions = {},
): DraftAgentInput {
	const recordScope = options.recordScope ?? "SELECTED";
	const resources = options.resources ?? [];
	const recordResources = resources.filter(
		(resource) => resource.kind !== "integration",
	);

	if (recordScope === "SELECTED" && recordResources.length === 0) {
		throw new Error("Selected Close draft needs at least one CRM resource.");
	}
	if (recordScope === "WORKSPACE" && recordResources.length > 0) {
		throw new Error("Workspace Close draft cannot list selected records.");
	}

	const triggers =
		recordScope === "SELECTED"
			? CLOSE_TRIGGERS.filter((trigger) => trigger.type === "MANUAL")
			: CLOSE_TRIGGERS;

	const draft: DraftAgentInput = {
		name: options.name ?? CLOSE_SPECIALIST_NAME,
		description: options.description ?? CLOSE_SPECIALIST_DESCRIPTION,
		instructions: options.instructions ?? CLOSE_SPECIALIST_INSTRUCTIONS,
		lifecycleRole: CLOSE_LIFECYCLE_ROLE,
		triggers,
		recordScope,
		resources,
		actions: CLOSE_ACTIONS,
		access: [
			recordScope === "WORKSPACE"
				? "Read workspace CRM records"
				: "Read selected CRM records",
			"Write notes on CRM records",
			"Create tasks on CRM records",
		],
	};

	assertCloseRecommendOnlyActions(draft.actions);
	return draft;
}

export function closeSpecialistManifest(
	options: CloseDraftOptions = {},
): AgentManifest {
	const draft = closeSpecialistDraft(options);
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
					? "Workspace CRM records for closed-deal hygiene"
					: "Selected CRM records for manual close handoff",
			resources: draft.resources,
		},
		actions: draft.actions,
		access: draft.access,
	};

	return parseAgentManifest(manifest);
}
