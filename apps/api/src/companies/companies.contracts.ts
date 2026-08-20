import { DealStage, EnrichmentStatus, RecordSource } from "@crm/db";
import { FIELD_TYPES } from "@crm/db/fields";
import { z } from "zod";
import { bulkIdsInput } from "../crm/bulk";
import { fieldEntity, recordFieldValues } from "../fields/fields.contracts";
import { activityFacetInput, listInput } from "../trpc/list-input";

export const companyListInput = listInput.extend({
	owner: z.array(z.string()).default([]),
	industry: z.array(z.string()).default([]),
	enrichment: z.array(z.string()).default([]),
	source: z.array(z.string()).default([]),
	activity: activityFacetInput.default([]),
	fields: z.record(z.string(), z.array(z.string())).default({}),
	archived: z.boolean().default(false),
});

export type CompanyListInput = z.infer<typeof companyListInput>;

export const companyCreateInput = z.object({
	name: z.string().trim().min(1, "A company needs a name."),
	domain: z.string().trim().optional(),
	ownerId: z.string().nullable().optional(),
});

export type CompanyCreateInput = z.infer<typeof companyCreateInput>;

const companyUpdateInput = z.object({
	name: z.string().trim().min(1).optional(),
	domain: z.string().optional(),
	website: z.string().optional(),
	description: z.string().optional(),
	industry: z.string().optional(),
	city: z.string().optional(),
	stateCode: z.string().optional(),
	country: z.string().optional(),
	phone: z.string().optional(),
	email: z.string().optional(),
	linkedinUrl: z.string().optional(),
	ownerId: z.string().nullable().optional(),
	fields: recordFieldValues.optional(),
});

export type CompanyUpdateInput = z.infer<typeof companyUpdateInput>;

export const companyUpdateArgs = z.object({
	id: z.string(),
	data: companyUpdateInput,
});

export const companyIdInput = z.object({ id: z.string() });

export const setPrimaryContactInput = z.object({
	companyId: z.string(),
	contactId: z.string().nullable(),
});

export const companyOptionsInput = z.object({
	q: z.string().default(""),
});

export const companyBulkInput = bulkIdsInput;

export const companyBulkOwnerInput = bulkIdsInput.extend({
	ownerId: z.string().nullable(),
});

export type CompanyBulkOwnerInput = z.infer<typeof companyBulkOwnerInput>;

const companyEnrichmentStatus = z.enum(
	Object.values(EnrichmentStatus) as [EnrichmentStatus, ...EnrichmentStatus[]],
);

const companyRecordSource = z.enum(
	Object.values(RecordSource) as [RecordSource, ...RecordSource[]],
);

const companyDealStage = z.enum(
	Object.values(DealStage) as [DealStage, ...DealStage[]],
);

const companyFieldType = z.enum(FIELD_TYPES);

const ownerSummaryOutput = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

const companyFieldOptionOutput = z.object({
	id: z.string(),
	label: z.string(),
	position: z.number(),
});

const companyRecordFieldOutput = z.object({
	id: z.string(),
	entity: fieldEntity,
	key: z.string(),
	label: z.string(),
	type: companyFieldType,
	typeLabel: z.string(),
	agentFilled: z.boolean(),
	agentBrief: z.string().nullable(),
	required: z.boolean(),
	showOnSheet: z.boolean(),
	showOnTable: z.boolean(),
	showOnFilter: z.boolean(),
	position: z.number(),
	archived: z.boolean(),
	options: z.array(companyFieldOptionOutput),
	value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export const companyRowOutput = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string().nullable(),
	iconUrl: z.string().nullable(),
	iconDarkUrl: z.string().nullable(),
	iconTone: z.string().nullable(),
	logoUrl: z.string().nullable(),
	brandColor: z.string().nullable(),
	industry: z.string().nullable(),
	enrichmentStatus: companyEnrichmentStatus,
	queued: z.boolean(),
	source: companyRecordSource,
	owner: ownerSummaryOutput.nullable(),
	contactCount: z.number(),
	openDealCount: z.number(),
	lastActivityAt: z.string().nullable(),
	createdAt: z.string(),
	archivedAt: z.string().nullable(),
	fields: recordFieldValues,
});

export type CompanyRow = z.infer<typeof companyRowOutput>;

export const companyListOutput = z.object({
	rows: z.array(companyRowOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
});

const companyDetailContactOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
	title: z.string().nullable(),
	imageUrl: z.string().nullable(),
	owner: ownerSummaryOutput.nullable(),
});

const companyDetailDealOutput = z.object({
	id: z.string(),
	name: z.string(),
	stage: companyDealStage,
	currency: z.string(),
	expectedCloseDate: z.string().nullable(),
	owner: ownerSummaryOutput.nullable(),
	amountCents: z.number().nullable(),
	baseAmountCents: z.number().nullable(),
});

const companyDetailPrimaryContactOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	title: z.string().nullable(),
});

export const companyDetailOutput = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string().nullable(),
	website: z.string().nullable(),
	description: z.string().nullable(),
	logoUrl: z.string().nullable(),
	logoDarkUrl: z.string().nullable(),
	iconUrl: z.string().nullable(),
	iconDarkUrl: z.string().nullable(),
	iconTone: z.string().nullable(),
	brandColor: z.string().nullable(),
	industry: z.string().nullable(),
	subIndustry: z.string().nullable(),
	city: z.string().nullable(),
	stateCode: z.string().nullable(),
	country: z.string().nullable(),
	countryCode: z.string().nullable(),
	phone: z.string().nullable(),
	email: z.string().nullable(),
	linkedinUrl: z.string().nullable(),
	twitterUrl: z.string().nullable(),
	githubUrl: z.string().nullable(),
	pricingUrl: z.string().nullable(),
	careersUrl: z.string().nullable(),
	enrichmentStatus: companyEnrichmentStatus,
	enrichmentError: z.string().nullable(),
	source: companyRecordSource,
	owner: ownerSummaryOutput.nullable(),
	contacts: z.array(companyDetailContactOutput),
	fields: z.array(companyRecordFieldOutput),
	queued: z.boolean(),
	createdAt: z.string(),
	archivedAt: z.string().nullable(),
	enrichedAt: z.string().nullable(),
	primaryContactId: z.string().nullable(),
	primaryContact: companyDetailPrimaryContactOutput.nullable(),
	reportingCurrency: z.string(),
	deals: z.array(companyDetailDealOutput),
});

export const companyOptionOutput = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		domain: z.string().nullable(),
		iconUrl: z.string().nullable(),
	}),
);

export const companySummaryOutput = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string().nullable(),
});

export const companyArchiveResultOutput = z.object({
	id: z.string(),
	name: z.string(),
});

export const companyBulkResultOutput = z.object({
	requested: z.number(),
	succeeded: z.number(),
	failed: z.number(),
	message: z.string().nullable(),
});

export const companyEnrichOutput = z.object({
	id: z.string(),
	queued: z.boolean(),
});

export const companyResearchOutput = z.object({
	ok: z.literal(true),
	queued: z.literal(true),
});

export const companySetPrimaryContactOutput = z.object({
	id: z.string(),
	primaryContactId: z.string().nullable(),
});
