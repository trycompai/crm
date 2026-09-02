import { schemas } from "@crm/validation";
import { agentActionResult } from "@crm/validation/agent-action";
import { z } from "zod";

export const agentManifest = schemas.agents.capabilities.loose();

const agentManifestSummaryOutput = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
	access: z.array(z.string()),
	triggers: z.array(
		z.object({ type: z.string().optional(), summary: z.string().optional() }),
	),
	actions: z.array(z.object({ summary: z.string().optional() })),
	dataScope: z.object({ summary: z.string().optional() }),
});

const agentDefinitionStatus = z.enum([
	"DRAFT",
	"DEPLOYING",
	"LIVE",
	"PAUSED",
	"ARCHIVED",
	"DELETED",
]);

const agentVersionStatus = z.enum([
	"DRAFT",
	"VALIDATING",
	"READY",
	"DEPLOYED",
	"REJECTED",
]);

const agentRunStatus = z.enum([
	"QUEUED",
	"RUNNING",
	"WAITING_FOR_APPROVAL",
	"SUCCEEDED",
	"FAILED",
	"CANCELLED",
]);

const agentActionStatus = z.enum([
	"PLANNED",
	"RUNNING",
	"SUCCEEDED",
	"FAILED",
	"CANCELLED",
]);

const agentTriggerType = z.enum(["MANUAL", "SCHEDULE", "EVENT", "WEBHOOK"]);

const agentUserSummaryOutput = z.object({
	id: z.string(),
	name: z.string(),
	image: z.string().nullable(),
});

const agentVersionRefOutput = z.object({
	id: z.string(),
	number: z.number(),
});

export const agentIdInput = z.object({ id: z.string().min(1) });

export const agentHistoryInput = agentIdInput.extend({
	limit: z.number().int().min(1).max(100).default(50),
});

export const agentUpdateInput = agentIdInput.extend({
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(500).nullable(),
});

export type AgentUpdateInput = z.infer<typeof agentUpdateInput>;

export const agentRunNowInput = agentIdInput.extend({
	clientRequestId: z.uuid(),
});

export type AgentRunNowInput = z.infer<typeof agentRunNowInput>;

export const agentRetryRunInput = agentIdInput.extend({
	runId: z.string().min(1),
	clientRequestId: z.uuid(),
});

export type AgentRetryRunInput = z.infer<typeof agentRetryRunInput>;

export const agentCancelRunInput = agentIdInput.extend({
	runId: z.string().min(1),
});

export type AgentCancelRunInput = z.infer<typeof agentCancelRunInput>;

export const agentDeployInput = agentIdInput.extend({
	versionId: z.string().min(1),
	clientRequestId: z.uuid(),
});

export type AgentDeployInput = z.infer<typeof agentDeployInput>;

export const agentReviseInput = agentIdInput.extend({
	clientRequestId: z.uuid(),
	channel: z
		.object({
			id: z.string().trim().min(1).max(64),
			name: z.string().trim().min(1).max(120),
		})
		.optional(),
	actions: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
	resources: z
		.array(
			z.object({
				id: z.string().trim().min(1).max(160),
				kind: z.enum(["company", "contact", "deal", "integration"]),
				label: z.string().trim().min(1).max(160),
			}),
		)
		.max(50)
		.optional(),
});

export type AgentReviseInput = z.infer<typeof agentReviseInput>;

export const agentSaveFileInput = agentIdInput.extend({
	clientRequestId: z.uuid(),
	path: z.string().trim().min(1).max(400),
	content: z.string().max(500_000),
});

export type AgentSaveFileInput = z.infer<typeof agentSaveFileInput>;

const agentListItemOutput = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	status: agentDefinitionStatus,
	createdAt: z.string(),
	updatedAt: z.string(),
	createdBy: agentUserSummaryOutput,
	currentVersion: z
		.object({
			id: z.string(),
			number: z.number(),
			deployedAt: z.string().nullable(),
		})
		.nullable(),
	triggers: z.array(
		z.object({
			id: z.string(),
			type: agentTriggerType,
			name: z.string(),
			nextRunAt: z.string().nullable(),
		}),
	),
	runCount: z.number(),
});

export const agentListOutput = z.array(agentListItemOutput);

export type AgentListItem = z.infer<typeof agentListItemOutput>;

export const agentReviseOutput = z.object({ versionId: z.string() });

export const agentFilesOutput = z.object({
	versionId: z.string().nullable(),
	files: z.array(
		z.object({
			path: z.string(),
			language: z.string(),
			content: z.string(),
			previousContent: z.string().nullable(),
			revision: z.number(),
		}),
	),
});

export const agentSaveFileOutput = z.object({
	saved: z.boolean(),
	versionId: z.string().nullable(),
});

const agentCapabilitiesResultOutput = z.discriminatedUnion("readable", [
	z.object({
		readable: z.literal(false),
		problem: z.string(),
		actions: z.array(schemas.agents.capabilityAction),
		dataScope: z.null(),
		channel: z.null(),
	}),
	z.object({
		readable: z.literal(true),
		problem: z.null(),
		actions: z.array(schemas.agents.capabilityAction),
		dataScope: schemas.agents.capabilities.shape.dataScope,
		channel: schemas.agentManifest.slackDestination.nullable(),
	}),
]);

export const agentByIdOutput = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	status: agentDefinitionStatus,
	createdById: z.string(),
	createdBy: agentUserSummaryOutput,
	canManage: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
	currentVersion: z
		.object({
			id: z.string(),
			number: z.number(),
			status: agentVersionStatus,
			manifest: z.unknown(),
			modelId: z.string(),
			sandboxPolicy: z.unknown(),
			approvedAt: z.string().nullable(),
			deployedAt: z.string().nullable(),
		})
		.nullable(),
	reviewVersion: z
		.object({
			id: z.string(),
			number: z.number(),
			status: z.enum(["DRAFT", "READY"]),
			manifest: agentManifestSummaryOutput,
			modelId: z.string(),
			sandboxPolicy: z.unknown(),
			sourceConversationId: z.string().nullable(),
		})
		.nullable(),
	triggers: z.array(
		z.object({
			id: z.string(),
			type: agentTriggerType,
			name: z.string(),
			config: z.unknown(),
			enabled: z.boolean(),
			nextRunAt: z.string().nullable(),
			lastRunAt: z.string().nullable(),
		}),
	),
	runCount: z.number(),
	capabilities: agentCapabilitiesResultOutput,
});

export type AgentDetail = z.infer<typeof agentByIdOutput>;

const agentRunEventOutput = z.object({
	id: z.string(),
	sequence: z.number(),
	type: z.string(),
	data: z.unknown(),
	emittedAt: z.string(),
});

const agentRunActionOutput = z.object({
	id: z.string(),
	type: z.string(),
	provider: z.string(),
	targetType: z.string().nullable(),
	targetId: z.string().nullable(),
	targetLabel: z.string().nullable(),
	summary: z.string(),
	status: agentActionStatus,
	externalId: z.string().nullable(),
	attemptCount: z.number(),
	errorCode: z.string().nullable(),
	errorMessage: z.string().nullable(),
	result: agentActionResult.nullable(),
	plannedAt: z.string(),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
});

const agentRunSummaryOutput = z.object({
	id: z.string(),
	status: agentRunStatus,
	triggerType: agentTriggerType,
	summary: z.string().nullable(),
	modelId: z.string().nullable(),
	inputTokens: z.number().nullable(),
	outputTokens: z.number().nullable(),
	costUsd: z.string().nullable(),
	errorCode: z.string().nullable(),
	errorMessage: z.string().nullable(),
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
	initiatedBy: agentUserSummaryOutput.nullable(),
	version: agentVersionRefOutput,
	totalEvents: z.number(),
	eventsTruncated: z.boolean(),
	canCancel: z.boolean(),
	events: z.array(agentRunEventOutput),
	actions: z.array(agentRunActionOutput),
});

export const agentHistoryOutput = z.array(agentRunSummaryOutput);

export type AgentRunSummary = z.infer<typeof agentRunSummaryOutput>;

const agentAuditEventOutput = z.object({
	id: z.string(),
	type: z.string(),
	summary: z.string(),
	before: z.unknown().nullable(),
	after: z.unknown().nullable(),
	requestId: z.string().nullable(),
	emittedAt: z.string(),
	actorType: z.string(),
	actorId: z.string().nullable(),
	actorUser: agentUserSummaryOutput.nullable(),
	version: agentVersionRefOutput.nullable(),
});

export const agentActivityOutput = z.array(agentAuditEventOutput);

export type AgentAuditEventSummary = z.infer<typeof agentAuditEventOutput>;

export const agentUpdateOutput = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	status: agentDefinitionStatus,
});

export const agentDeployOutput = z.object({
	id: z.string(),
	versionId: z.string(),
	status: z.literal("LIVE"),
});

export const agentPauseOutput = z.object({
	id: z.string(),
	name: z.string(),
	status: z.literal("PAUSED"),
	updatedAt: z.string(),
});

export const agentResumeOutput = z.object({
	id: z.string(),
	name: z.string(),
	status: z.literal("LIVE"),
	updatedAt: z.string(),
});

export const agentArchiveOutput = z.object({
	id: z.string(),
	name: z.string(),
	status: z.literal("ARCHIVED"),
	updatedAt: z.string(),
});

export const agentRestoreOutput = z.object({
	id: z.string(),
	name: z.string(),
	status: z.literal("PAUSED"),
	updatedAt: z.string(),
});

export const agentRemoveOutput = z.object({
	id: z.string(),
	name: z.string(),
	status: z.literal("DELETED"),
	updatedAt: z.string(),
	disabledTriggers: z.number(),
	cancelledRuns: z.number(),
});

export const agentRunNowOutput = z.object({ id: z.string() });

export const agentRetryRunOutput = z.object({ id: z.string() });

export const agentCancelRunOutput = z.object({
	id: z.string(),
	status: agentRunStatus,
	cancelled: z.boolean(),
});
