import {
	AgentBuilderArtifactStatus,
	AgentConversationCommandType,
	AgentConversationSubmissionStatus,
	AgentDefinitionStatus,
	AgentResponseRating,
	AgentTriggerType,
	AgentVersionStatus,
} from "@crm/db";
import { z } from "zod";

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

const builderQuestionOutput = z
	.object({
		kind: z.literal("question"),
		requestId: z.string(),
		prompt: z.string(),
		display: z.enum(["confirmation", "select", "text"]).optional(),
		options: z.array(
			z.object({
				id: z.string(),
				label: z.string(),
				description: z.string().optional(),
				style: z.enum(["danger", "default", "primary"]).optional(),
			}),
		),
		allowFreeform: z.boolean().optional(),
	})
	.nullable();

const recordShape = {
	contactId: z.string().trim().min(1).optional(),
	companyId: z.string().trim().min(1).optional(),
	dealId: z.string().trim().min(1).optional(),
};

const hasExactlyOneRecord = (input: {
	contactId?: string;
	companyId?: string;
	dealId?: string;
}) =>
	[input.contactId, input.companyId, input.dealId].filter(Boolean).length === 1;

const recordMessage = "Choose exactly one contact, company or deal.";

export const conversationListInput = z
	.object(recordShape)
	.refine(hasExactlyOneRecord, { message: recordMessage });

export type ConversationListInput = z.infer<typeof conversationListInput>;

export const conversationSaveInput = z
	.object({
		...recordShape,
		sessionId: z.string().trim().min(1),
		continuationToken: z.string().nullish(),
		streamIndex: z.number().int().min(0).optional(),
		title: z.string().trim().max(120).optional(),
		messageCount: z.number().int().min(0).optional(),
	})
	.refine(hasExactlyOneRecord, { message: recordMessage });

export type ConversationSaveInput = z.infer<typeof conversationSaveInput>;

export const conversationIdInput = z.object({ id: z.string() });

export const conversationEventsInput = z.object({
	id: z.string(),
	limit: z.number().int().min(1).max(5000).default(2000),
});

export type ConversationEventsInput = z.infer<typeof conversationEventsInput>;

export const builderResource = z.object({
	kind: z.enum(["integration", "company", "contact", "deal"]),
	id: z.string().trim().min(1).max(160),
	label: z.string().trim().min(1).max(120),
	detail: z.string().trim().max(160).nullable().optional(),
	imageUrl: z.url().nullable().optional(),
});

export const builderAttachment = z
	.object({
		name: z.string().trim().min(1).max(180),
		type: z.string().trim().min(1).max(120),
		size: z.number().int().min(1).max(2_000_000),
		contentBase64: z
			.string()
			.min(1)
			.max(2_800_000)
			.regex(
				/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/,
				"Attachment content must be valid base64.",
			),
	})
	.refine(
		(attachment) =>
			decodedBase64Size(attachment.contentBase64) === attachment.size,
		{ message: "Attachment size does not match its content.", path: ["size"] },
	);

const builderStoredAttachment = z.object({
	id: z.string().trim().min(1),
	name: z.string().trim().min(1).max(180),
	type: z.string().trim().min(1).max(120),
	size: z.number().int().min(1).max(2_000_000),
	previewUrl: z.string().nullable().optional(),
});

const builderPromptShape = {
	clientRequestId: z.uuid(),
	commandType: z.enum(["CHAT", "CREATE_AGENT"]).default("CHAT"),
	message: z.string().trim().min(1).max(20_000),
	resources: z.array(builderResource).max(20).default([]),
};

export const builderConversationCreateInput = z.object({
	...builderPromptShape,
	attachments: z.array(builderAttachment).max(5).default([]),
});

export type BuilderConversationCreateInput = z.infer<
	typeof builderConversationCreateInput
>;

export const builderConversationSubmitInput = z.object({
	...builderPromptShape,
	id: z.string().min(1),
	attachments: z
		.array(z.union([builderAttachment, builderStoredAttachment]))
		.max(5)
		.default([]),
});

export type BuilderConversationSubmitInput = z.infer<
	typeof builderConversationSubmitInput
>;

export const builderQuestionResponseInput = z
	.object({
		id: z.string().min(1),
		clientRequestId: z.uuid(),
		requestId: z.string().trim().min(1).max(240),
		optionId: z.string().trim().min(1).max(160).optional(),
		text: z.string().trim().min(1).max(20_000).optional(),
	})
	.refine((input) => Boolean(input.optionId) !== Boolean(input.text), {
		message: "Choose one option or enter a written answer.",
	});

export type BuilderQuestionResponseInput = z.infer<
	typeof builderQuestionResponseInput
>;

export const sharedConversationInput = z.object({
	token: z.string().trim().min(32).max(256),
});

export const builderResourceSearchInput = z.object({
	q: z.string().trim().max(120).default(""),
});

export const builderResponseRatingInput = z.object({
	id: z.string().min(1),
	messageId: z.string().trim().min(1).max(240),
	rating: z.enum(["UP", "DOWN"]).nullable(),
});

function decodedBase64Size(value: string): number {
	const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
	return (value.length / 4) * 3 - padding;
}

const agentDefinitionStatusOutput = z.enum(
	Object.values(AgentDefinitionStatus) as [
		AgentDefinitionStatus,
		...AgentDefinitionStatus[],
	],
);

const agentVersionStatusOutput = z.enum(
	Object.values(AgentVersionStatus) as [
		AgentVersionStatus,
		...AgentVersionStatus[],
	],
);

const agentBuilderArtifactStatusOutput = z.enum(
	Object.values(AgentBuilderArtifactStatus) as [
		AgentBuilderArtifactStatus,
		...AgentBuilderArtifactStatus[],
	],
);

const agentTriggerTypeOutput = z.enum(
	Object.values(AgentTriggerType) as [AgentTriggerType, ...AgentTriggerType[]],
);

const agentConversationCommandTypeOutput = z.enum(
	Object.values(AgentConversationCommandType) as [
		AgentConversationCommandType,
		...AgentConversationCommandType[],
	],
);

const agentConversationSubmissionStatusOutput = z.enum(
	Object.values(AgentConversationSubmissionStatus) as [
		AgentConversationSubmissionStatus,
		...AgentConversationSubmissionStatus[],
	],
);

const agentResponseRatingOutput = z.enum(
	Object.values(AgentResponseRating) as [
		AgentResponseRating,
		...AgentResponseRating[],
	],
);

export const conversationIdOutput = z.object({ id: z.string() });

export const conversationSummaryOutput = z.object({
	id: z.string(),
	sessionId: z.string(),
	continuationToken: z.string().nullable(),
	streamIndex: z.number(),
	title: z.string().nullable(),
	messageCount: z.number(),
	lastMessageAt: z.string(),
});

export const conversationListOutput = z.array(conversationSummaryOutput);

export type ConversationSummary = z.infer<typeof conversationSummaryOutput>;

const builderConversationAgentSummaryOutput = z.object({
	id: z.string(),
	name: z.string(),
	status: agentDefinitionStatusOutput,
});

export const builderConversationSummaryOutput = z.object({
	id: z.string(),
	sessionId: z.string().nullable(),
	continuationToken: z.string().nullable(),
	streamIndex: z.number(),
	title: z.string().nullable(),
	messageCount: z.number(),
	lastMessageAt: z.string(),
	lastAssistantAt: z.string().nullable(),
	unread: z.boolean(),
	state: z.enum(["working", "unread", "deployed", "idle"]),
	agent: builderConversationAgentSummaryOutput.nullable(),
});

export const builderListOutput = z.array(builderConversationSummaryOutput);

export type BuilderConversationSummary = z.infer<
	typeof builderConversationSummaryOutput
>;

export const builderResourceOutput = z.object({
	kind: z.enum(["integration", "company", "contact", "deal"]),
	id: z.string(),
	label: z.string(),
	detail: z.string().nullable(),
	imageUrl: z.string().nullable(),
});

export const builderResourcesOutput = z.array(builderResourceOutput);

export const agentBuilderArtifactOutput = z.object({
	id: z.string(),
	versionId: z.string().nullable(),
	path: z.string(),
	language: z.string(),
	content: z.string(),
	previousContent: z.string().nullable(),
	revision: z.number(),
	status: agentBuilderArtifactStatusOutput,
	createdAt: z.string(),
});

const agentTriggerSummaryOutput = z.object({
	id: z.string(),
	type: agentTriggerTypeOutput,
	name: z.string(),
	config: z.unknown(),
	enabled: z.boolean(),
	nextRunAt: z.string().nullable(),
});

const agentCurrentVersionSummaryOutput = z.object({
	id: z.string(),
	number: z.number(),
	status: agentVersionStatusOutput,
	manifest: z.unknown(),
	modelId: z.string(),
	sandboxPolicy: z.unknown(),
	deployedAt: z.string().nullable(),
});

const builderAgentDetailOutput = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	status: agentDefinitionStatusOutput,
	createdBy: z.object({ id: z.string(), name: z.string() }),
	currentVersion: agentCurrentVersionSummaryOutput.nullable(),
	triggers: z.array(agentTriggerSummaryOutput),
});

const builderCreatedVersionOutput = z.object({
	id: z.string(),
	number: z.number(),
	status: agentVersionStatusOutput,
	instructions: z.string(),
	manifest: agentManifestSummaryOutput,
	modelId: z.string(),
	sandboxPolicy: z.unknown(),
	validation: z.unknown().nullable(),
	createdAt: z.string(),
});

const builderFeedbackOutput = z.object({
	messageId: z.string(),
	rating: agentResponseRatingOutput,
});

const builderSubmissionOutput = z.object({
	id: z.string(),
	clientRequestId: z.string(),
	commandType: agentConversationCommandTypeOutput,
	message: z.record(z.string(), z.unknown()),
	status: agentConversationSubmissionStatusOutput,
	errorCode: z.string().nullable(),
	errorMessage: z.string().nullable(),
	createdAt: z.string(),
	sentAt: z.string().nullable(),
	acceptedAt: z.string().nullable(),
});

export const builderConversationDetailOutput = z.object({
	id: z.string(),
	sessionId: z.string().nullable(),
	continuationToken: z.string().nullable(),
	streamIndex: z.number(),
	title: z.string().nullable(),
	messageCount: z.number(),
	lastMessageAt: z.string(),
	lastAssistantAt: z.string().nullable(),
	lastReadAt: z.string().nullable(),
	pendingQuestion: builderQuestionOutput,
	agent: builderAgentDetailOutput.nullable(),
	createdVersions: z.array(builderCreatedVersionOutput),
	builderArtifacts: z.array(agentBuilderArtifactOutput),
	feedback: z.array(builderFeedbackOutput),
	submissions: z.array(builderSubmissionOutput),
});

export const conversationEventOutput = z.object({
	type: z.string(),
	data: z.unknown(),
	meta: z.object({ id: z.string(), at: z.string() }),
});

export const conversationEventsOutput = z.array(conversationEventOutput);

export const builderResponseRatingOutput = z.object({
	id: z.string(),
	rating: agentResponseRatingOutput.nullable(),
});

export const conversationShareStatusOutput = z.object({
	enabled: z.boolean(),
	createdAt: z.string().nullable(),
	expiresAt: z.string().nullable(),
});

export const conversationShareTokenOutput = z.object({ token: z.string() });

const sharedConversationAgentOutput = z.object({
	id: z.string(),
	name: z.string(),
	status: agentDefinitionStatusOutput,
});

const sharedConversationSubmissionOutput = z.object({
	id: z.string(),
	commandType: agentConversationCommandTypeOutput,
	message: z.record(z.string(), z.unknown()),
	status: agentConversationSubmissionStatusOutput,
	errorMessage: z.string().nullable(),
	createdAt: z.string(),
});

export const sharedConversationOutput = z.object({
	id: z.string(),
	title: z.string().nullable(),
	ownerName: z.string(),
	lastMessageAt: z.string(),
	agent: sharedConversationAgentOutput.nullable(),
	builderArtifacts: z.array(agentBuilderArtifactOutput),
	submissions: z.array(sharedConversationSubmissionOutput),
	events: conversationEventsOutput,
});
