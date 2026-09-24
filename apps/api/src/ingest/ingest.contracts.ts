import { z } from "zod";

export type SignalPayloadValue =
	| string
	| number
	| boolean
	| null
	| SignalPayloadValue[]
	| { [key: string]: SignalPayloadValue };

const signalPayloadValue: z.ZodType<SignalPayloadValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number().finite(),
		z.boolean(),
		z.null(),
		z.array(signalPayloadValue),
		z.record(z.string(), signalPayloadValue),
	]),
);

export const signalPayload = z.record(z.string(), signalPayloadValue);
export type SignalPayload = z.infer<typeof signalPayload>;

export const ingestSignalInput = z.object({
	project: z.string().trim().min(1).max(96),
	source: z.string().trim().min(1).max(96),
	sourceType: z.string().trim().min(1).max(160),
	sourceId: z.string().trim().min(1).max(320),
	sourceUrl: z.string().url().nullable().optional(),
	observedAt: z.string().datetime({ offset: true }).nullable().optional(),
	entity: z.string().trim().min(1).max(320).nullable().optional(),
	signalScore: z.number().min(0).max(100).nullable().optional(),
	tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
	payload: signalPayload.default({}),
});

export const ingestSignalOutput = z.object({
	status: z.literal("accepted"),
	sourceRecordId: z.string(),
	project: z.string(),
	deduplicated: z.boolean(),
	promoted: z.literal(false),
});

export const signalInboxInput = z.object({
	project: z.string().trim().min(1).max(96).optional(),
	source: z.string().trim().min(1).max(96).optional(),
	minScore: z.number().min(0).max(100).optional(),
	status: z.enum(["all", "unresolved", "mapped"]).default("unresolved"),
	limit: z.number().int().min(1).max(200).default(50),
});

export const signalInboxItem = z.object({
	sourceRecordId: z.string(),
	project: z.string(),
	source: z.string(),
	sourceType: z.string(),
	sourceId: z.string(),
	sourceUrl: z.string().nullable(),
	observedAt: z.string(),
	entity: z.string().nullable(),
	signalScore: z.number().nullable(),
	company: z.string().nullable(),
	subject: z.string().nullable(),
	stageKey: z.string().nullable(),
	priority: z.string().nullable(),
	demandTrigger: z.string().nullable(),
	nextAction: z.string().nullable(),
	mapped: z.boolean(),
	payload: signalPayload,
});

export const signalInboxOutput = z.object({
	rows: z.array(signalInboxItem),
	count: z.number().int().nonnegative(),
});

export const signalSourceRecordInput = z.object({
	sourceRecordId: z.string().trim().min(1),
});

export const companyCandidateOutput = z.object({
	companyId: z.string(),
	name: z.string(),
	domain: z.string().nullable(),
	businessUnitId: z.string().nullable(),
	score: z.number().min(0).max(110),
	reasons: z.array(z.string()),
});

export const signalCompanyCandidatesOutput = z.object({
	sourceRecordId: z.string(),
	project: z.string(),
	entity: z.string().nullable(),
	domain: z.string().nullable(),
	mappedCompanyId: z.string().nullable(),
	candidates: z.array(companyCandidateOutput),
});

export const resolveSignalCompanyInput = signalSourceRecordInput.extend({
	companyId: z.string().trim().min(1).nullable().optional(),
	companyName: z.string().trim().min(1).max(320).nullable().optional(),
	domain: z.string().trim().max(320).nullable().optional(),
	createIfMissing: z.boolean().default(false),
	queueResearch: z.boolean().default(true),
});

export const resolveSignalCompanyOutput = z.object({
	sourceRecordId: z.string(),
	canonicalCompanyId: z.string(),
	companyId: z.string(),
	companyName: z.string(),
	matchMethod: z.string(),
	created: z.boolean(),
	researchQueued: z.boolean(),
});

export const signalScoreComponents = z.object({
	icpMatch: z.number().min(0).max(25),
	commercialTrigger: z.number().min(0).max(20),
	projectRelevance: z.number().min(0).max(20),
	companyValue: z.number().min(0).max(10),
	location: z.number().min(0).max(10),
	decisionMaker: z.number().min(0).max(10),
	recency: z.number().min(0).max(5),
});

export const signalClassification = z.enum([
	"signal",
	"research",
	"qualified",
	"priority",
]);

export const qualifySignalInput = signalSourceRecordInput.extend({
	components: signalScoreComponents.optional(),
	evidence: z.record(z.string(), z.string().max(2000)).default({}),
	notes: z.string().trim().max(4000).nullable().optional(),
});

export const qualifySignalOutput = z.object({
	sourceRecordId: z.string(),
	score: z.number().min(0).max(100),
	classification: signalClassification,
	method: z.enum(["components", "legacy-score", "unscored"]),
	companyResolved: z.boolean(),
	canonicalOpportunityEligible: z.boolean(),
	visibleDealEligible: z.boolean(),
});

export const promoteSignalInput = signalSourceRecordInput.extend({
	createDeal: z.boolean().default(false),
	ownerId: z.string().trim().min(1).nullable().optional(),
	amountUsd: z.number().nonnegative().nullable().optional(),
});

export const promoteSignalOutput = z.object({
	sourceRecordId: z.string(),
	score: z.number().min(0).max(100),
	classification: signalClassification,
	canonicalOpportunityId: z.string(),
	dealId: z.string().nullable(),
	createdCanonicalOpportunity: z.boolean(),
	createdDeal: z.boolean(),
});

export type IngestSignalInput = z.infer<typeof ingestSignalInput>;
export type IngestSignalOutput = z.infer<typeof ingestSignalOutput>;
export type SignalInboxInput = z.infer<typeof signalInboxInput>;
export type SignalInboxOutput = z.infer<typeof signalInboxOutput>;
export type SignalCompanyCandidatesOutput = z.infer<
	typeof signalCompanyCandidatesOutput
>;
export type ResolveSignalCompanyInput = z.infer<
	typeof resolveSignalCompanyInput
>;
export type ResolveSignalCompanyOutput = z.infer<
	typeof resolveSignalCompanyOutput
>;
export type SignalScoreComponents = z.infer<typeof signalScoreComponents>;
export type SignalClassification = z.infer<typeof signalClassification>;
export type QualifySignalInput = z.infer<typeof qualifySignalInput>;
export type QualifySignalOutput = z.infer<typeof qualifySignalOutput>;
export type PromoteSignalInput = z.infer<typeof promoteSignalInput>;
export type PromoteSignalOutput = z.infer<typeof promoteSignalOutput>;
