import { z } from "zod";

const recordShape = {
	contactId: z.string().trim().min(1).optional(),
	companyId: z.string().trim().min(1).optional(),
	dealId: z.string().trim().min(1).optional(),
	campaignId: z.string().trim().min(1).optional(),
	campaignNodeId: z.string().trim().min(1).optional(),
	segmentId: z.string().trim().min(1).optional(),
	templateId: z.string().trim().min(1).optional(),
	shellId: z.string().trim().min(1).optional(),
};

export type RecordScope = {
	contactId?: string;
	companyId?: string;
	dealId?: string;
	campaignId?: string;
	campaignNodeId?: string;
	segmentId?: string;
	templateId?: string;
	shellId?: string;
};

export function recordScopeIds(input: RecordScope): (string | undefined)[] {
	return [
		input.contactId,
		input.companyId,
		input.dealId,
		input.campaignId,
		input.segmentId,
		input.templateId,
		input.shellId,
	];
}

const hasExactlyOneRecord = (input: RecordScope) =>
	recordScopeIds(input).filter(Boolean).length === 1;

const nodeInsideItsCampaign = (input: RecordScope) =>
	!input.campaignNodeId || Boolean(input.campaignId);

const recordMessage =
	"Choose exactly one contact, company, deal, campaign, segment, template or shell.";

const nodeMessage = "A campaign node scope needs its campaign.";

export const conversationListInput = z
	.object(recordShape)
	.refine(hasExactlyOneRecord, { message: recordMessage })
	.refine(nodeInsideItsCampaign, { message: nodeMessage });

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
	.refine(hasExactlyOneRecord, { message: recordMessage })
	.refine(nodeInsideItsCampaign, { message: nodeMessage });

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
