import { AGENT_ACTION_TYPES } from "./agent-actions";
import type { AgentManifest } from "./agent-manifest";
import { parseAgentManifest } from "./agent-manifest";
import type { DraftAgentInput, DraftTrigger } from "./builder-runtime";

export const QUALIFY_LIFECYCLE_ROLE = "qualify" as const;

export const QUALIFY_SPECIALIST_NAME = "Qualify";

export const QUALIFY_SPECIALIST_DESCRIPTION =
	"Decide if a contact or company is worth pipeline time using CRM evidence and seller rules. Recommend only. Never send outreach.";

export const QUALIFY_SPECIALIST_INSTRUCTIONS = `You are the Qualify specialist for this CRM team agent.

Your job is to decide whether a contact or company is worth pipeline time.

Rules:
1. Read only CRM records in the approved scope and connected sources listed in the run.
2. Base every claim on CRM evidence you read in this run. Do not invent firmographics, titles, or fit scores.
3. Treat seller policy as external human config when available. If seller rules are missing, say so and stop inventing policy.
4. Produce a clear qualification decision: worth pursuing, not a fit, or needs human judgment.
5. Write only approved CRM notes and tasks. Put the decision, the reason, and the evidence references in that note or task.
6. Finish with run.summary. State the decision and what you wrote.
7. Never send email, SMS, or any external outreach. Never promise that a message was delivered.
8. Never change deal stage or ownership.
9. Stop after one decision cycle on the triggering or selected record.
`;

const QUALIFY_TRIGGERS: DraftTrigger[] = [
	{
		type: "MANUAL",
		name: "Qualify selected record",
		summary: "Run on demand for a tagged contact or company",
	},
	{
		type: "EVENT",
		name: "When a contact is created",
		summary: "Qualify a new contact for pipeline fit",
		event: "contact.created",
	},
	{
		type: "EVENT",
		name: "When a company is created",
		summary: "Qualify a new company for pipeline fit",
		event: "company.created",
	},
];

const QUALIFY_ACTIONS: DraftAgentInput["actions"] = [
	{
		type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
		provider: "crm",
		summary: "Record the qualification decision as a note or owner task",
		activityTypes: ["NOTE", "TASK"],
	},
	{
		type: AGENT_ACTION_TYPES.RUN_SUMMARY,
		provider: "crm",
		summary: "Summarize the qualification decision and evidence",
	},
];

export const QUALIFY_RECOMMEND_ONLY_ACTION_TYPES = [
	AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
	AGENT_ACTION_TYPES.RUN_SUMMARY,
] as const;

export function isRecommendOnlyActionType(type: string): boolean {
	return (QUALIFY_RECOMMEND_ONLY_ACTION_TYPES as readonly string[]).includes(
		type,
	);
}

export function assertQualifyRecommendOnlyActions(
	actions: ReadonlyArray<{ type: string }>,
): void {
	for (const action of actions) {
		if (!isRecommendOnlyActionType(action.type)) {
			throw new Error(
				`Qualify specialist forbids action type ${action.type}. Recommend-only CRM note/task and run summary are allowed.`,
			);
		}
	}
}

export type QualifyDraftOptions = {
	recordScope?: "SELECTED" | "WORKSPACE";
	resources?: DraftAgentInput["resources"];
	name?: string;
	description?: string;
	instructions?: string;
};

export function qualifySpecialistDraft(
	options: QualifyDraftOptions = {},
): DraftAgentInput {
	const recordScope = options.recordScope ?? "WORKSPACE";
	const resources = options.resources ?? [];
	const recordResources = resources.filter(
		(resource) => resource.kind !== "integration",
	);

	if (recordScope === "SELECTED" && recordResources.length === 0) {
		throw new Error("Selected Qualify draft needs at least one CRM resource.");
	}
	if (recordScope === "WORKSPACE" && recordResources.length > 0) {
		throw new Error("Workspace Qualify draft cannot list selected records.");
	}

	const triggers =
		recordScope === "SELECTED"
			? QUALIFY_TRIGGERS.filter((trigger) => trigger.type === "MANUAL")
			: QUALIFY_TRIGGERS;

	const draft: DraftAgentInput = {
		name: options.name ?? QUALIFY_SPECIALIST_NAME,
		description: options.description ?? QUALIFY_SPECIALIST_DESCRIPTION,
		instructions: options.instructions ?? QUALIFY_SPECIALIST_INSTRUCTIONS,
		lifecycleRole: QUALIFY_LIFECYCLE_ROLE,
		triggers,
		recordScope,
		resources,
		actions: QUALIFY_ACTIONS,
		access: [
			recordScope === "WORKSPACE"
				? "Read workspace CRM records"
				: "Read selected CRM records",
			"Write notes on CRM records",
			"Create tasks on CRM records",
		],
	};

	assertQualifyRecommendOnlyActions(draft.actions);
	return draft;
}

export function qualifySpecialistManifest(
	options: QualifyDraftOptions = {},
): AgentManifest {
	const draft = qualifySpecialistDraft(options);
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
					? "Workspace CRM records for intake qualification"
					: "Selected CRM records for manual qualification",
			resources: draft.resources,
		},
		actions: draft.actions,
		access: draft.access,
	};

	return parseAgentManifest(manifest);
}
