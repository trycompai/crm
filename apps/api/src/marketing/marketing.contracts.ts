import { graphEdgeInput, graphNodeInput } from "@crm/db/marketing";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

const ruleTree = z.custom<Record<string, unknown>>(
	(value) => typeof value === "object" && value !== null,
	{ message: "Rules must be an object." },
);

export const idInput = z.object({ id: z.string().min(1) });

export const saveKeyInput = z.object({ key: z.string().min(1).max(200) });

export const connectFinishInput = z.object({
	code: z.string().min(1).max(4096),
	state: z.string().min(1).max(512),
});

export const saveIdentityInput = z.object({
	fromName: z.string().max(120).default(""),
	fromAddress: z.string().min(3).max(320),
	replyTo: z.string().max(320).nullish(),
	postalAddress: z.string().min(1).max(400),
});

export const saveSendingInput = z.object({
	sendsPerMinute: z.number().int().min(1).max(6000),
	dailyCap: z.number().int().min(0).max(1_000_000).nullish(),
	quietStart: z.number().int().min(0).max(23).nullish(),
	quietEnd: z.number().int().min(0).max(23).nullish(),
	timeZone: z.string().min(1).max(60).default("UTC"),
});

export const setTrackingInput = z.object({
	openTracking: z.boolean().optional(),
	clickTracking: z.boolean().optional(),
});

export const setDomainInput = z.object({ name: z.string().min(3).max(253) });

export const addAttachmentInput = z.object({
	campaignId: z.string().min(1),
	filename: z.string().min(1).max(200),
	mimeType: z.string().min(1).max(120),
	contentBase64: z.string().min(1),
});

export const campaignListInput = listInput.extend({
	kind: z.string().default(""),
	status: z.string().default(""),
});

const segmentIds = z.array(z.string().min(1)).max(20);

export const createCampaignInput = z.object({
	name: z.string().min(1).max(160),
	kind: z.enum(["BLAST", "DRIP"]),
	segmentIds: segmentIds.optional(),
	excludeSegmentIds: segmentIds.optional(),
});

export const updateCampaignInput = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(160).optional(),
	segmentIds: segmentIds.optional(),
	excludeSegmentIds: segmentIds.optional(),
	fromName: z.string().max(120).nullish(),
	replyTo: z.string().max(320).nullish(),
	entryMode: z.enum(["MANUAL", "CONTINUOUS"]).optional(),
	entryDefinition: ruleTree.nullish(),
	exitDefinition: ruleTree.nullish(),
	reentryCooldownDays: z.number().int().min(0).max(3650).nullish(),
	maxPasses: z.number().int().min(1).max(20).optional(),
	scheduledAt: z.date().nullish(),
});

export const writeGraphInput = z.object({
	campaignId: z.string().min(1),
	nodes: z.array(graphNodeInput).min(1).max(200),
	edges: z.array(graphEdgeInput).max(400),
});

export const updateNodeInput = z.object({
	nodeId: z.string().min(1),
	label: z.string().max(120).nullish(),
	subject: z.string().max(200).nullish(),
	preheader: z.string().max(300).nullish(),
	document: z.unknown().optional(),
	delayHours: z.number().int().min(0).max(8760).nullish(),
	condition: ruleTree.nullish(),
	x: z.number().optional(),
	y: z.number().optional(),
});

export const scheduleInput = z.object({
	id: z.string().min(1),
	at: z.date().nullish(),
});

export const rejectInput = z.object({
	id: z.string().min(1),
	reason: z.string().max(400).optional(),
});

export const pauseInput = z.object({
	id: z.string().min(1),
	reason: z.string().max(200).optional(),
});

export const resumeInput = z.object({
	id: z.string().min(1),
	clocks: z.enum(["restart", "backlog"]).default("restart"),
});

export const archiveCampaignInput = z.object({
	id: z.string().min(1),
	mode: z.enum(["refuse", "drain", "stop"]).default("refuse"),
});

export const RECIPIENT_STATES = [
	"all",
	"opened",
	"clicked",
	"replied",
	"bounced",
	"unsubscribed",
	"skipped",
] as const;

export const ENROLMENT_STATES = ["all", "active", "stuck", "exited"] as const;

export const recipientsPageInput = listInput.extend({
	campaignId: z.string().min(1),
	state: z.string().default("all").pipe(z.enum(RECIPIENT_STATES)),
});

export const enrolmentsPageInput = listInput.extend({
	campaignId: z.string().min(1),
	state: z.string().default("all").pipe(z.enum(ENROLMENT_STATES)),
});

export const enrolInput = z.object({
	campaignId: z.string().min(1),
	contactId: z.string().min(1),
});

export const setKindInput = z.object({
	id: z.string().min(1),
	kind: z.enum(["BLAST", "DRIP"]),
});

export const enrolCompanyInput = z.object({
	campaignId: z.string().min(1),
	companyId: z.string().min(1),
});

export const winnerInput = z.object({
	nodeId: z.string().min(1),
	winningEdgeId: z.string().min(1),
});

export const sendDirectInput = z.object({
	contactId: z.string().min(1),
	templateId: z.string().min(1),
	replyTo: z.string().max(320).nullish(),
});

export const sendCompanyInput = z.object({
	companyId: z.string().min(1),
	templateId: z.string().min(1),
	replyTo: z.string().max(320).nullish(),
});

export const createSegmentInput = z.object({
	name: z.string().min(1).max(160),
	description: z.string().max(400).nullish(),
	definition: ruleTree.nullish(),
});

export const updateSegmentInput = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(160).optional(),
	description: z.string().max(400).nullish(),
	definition: ruleTree.nullish(),
});

export const previewSegmentInput = z.object({ definition: ruleTree });

export const segmentPageInput = listInput.extend({
	segmentId: z.string().min(1),
});

export const memberInput = z.object({
	segmentId: z.string().min(1),
	contactId: z.string().min(1),
});

export const previewShellInput = z.object({
	id: z.string().min(1),
	document: z.unknown().optional(),
});

export const savePartialInput = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(160).optional(),
	document: z.unknown().optional(),
});

export const uploadImageInput = z.object({
	filename: z.string().min(1).max(200),
	mimeType: z.string().min(1).max(120),
	contentBase64: z.string().min(1),
});

export const createTemplateInput = z.object({
	name: z.string().min(1).max(160),
	subject: z.string().max(200).default(""),
	document: z.unknown().optional(),
});

export const updateTemplateInput = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(160).optional(),
	subject: z.string().max(200).optional(),
	preheader: z.string().max(300).nullish(),
	document: z.unknown().optional(),
});

export const sendTestNodeInput = z.object({
	nodeId: z.string().min(1),
	subject: z.string().max(200).nullish(),
	preheader: z.string().max(300).nullish(),
	document: z.unknown().optional(),
});

export const previewNodeInput = z.object({
	document: z.unknown().optional(),
	nodeId: z.string().min(1),
	subject: z.string().max(200).nullish(),
	preheader: z.string().max(300).nullish(),
});

export const previewTemplateInput = z.object({
	document: z.custom<Record<string, unknown>>(
		(value) => typeof value === "object" && value !== null,
	),
	subject: z.string().max(200).nullish(),
	preheader: z.string().max(300).nullish(),
	contactId: z.string().nullish(),
});
