import {
	DealStage,
	EnrichmentStatus,
	FactBand,
	FactStatus,
	RecordSource,
} from "@crm/db";
import { FIELD_ENTITIES, FIELD_TYPES } from "@crm/db/fields";
import { z } from "zod";
import { bulkIdsInput } from "../crm/bulk";
import { recordFieldValues } from "../fields/fields.contracts";
import { activityFacetInput, listInput } from "../trpc/list-input";

export const contactListInput = listInput.extend({
	owner: z.array(z.string()).default([]),
	company: z.array(z.string()).default([]),
	source: z.array(z.string()).default([]),
	title: z.array(z.string()).default([]),
	seniority: z.array(z.string()).default([]),
	persona: z.array(z.string()).default([]),
	activity: activityFacetInput.default([]),
	fields: z.record(z.string(), z.array(z.string())).default({}),
	archived: z.boolean().default(false),
});

export type ContactListInput = z.infer<typeof contactListInput>;

export const contactCreateInput = z.object({
	firstName: z.string().trim().min(1, "A contact needs a first name."),
	lastName: z.string().trim().optional(),
	email: z.email("That is not an email address.").optional().or(z.literal("")),
	phone: z.string().trim().optional(),
	title: z.string().trim().optional(),
	companyId: z.string().nullable().optional(),
	ownerId: z.string().nullable().optional(),
});

export type ContactCreateInput = z.infer<typeof contactCreateInput>;

const contactUpdateInput = z.object({
	firstName: z.string().trim().min(1).optional(),
	lastName: z.string().optional(),
	email: z.string().optional(),
	phone: z.string().optional(),
	title: z.string().optional(),
	linkedinUrl: z.string().optional(),
	twitterUrl: z.string().optional(),
	githubUrl: z.string().optional(),
	companyId: z.string().nullable().optional(),
	ownerId: z.string().nullable().optional(),
	fields: recordFieldValues.optional(),
});

export type ContactUpdateInput = z.infer<typeof contactUpdateInput>;

export const contactUpdateArgs = z.object({
	id: z.string(),
	data: contactUpdateInput,
});

export const contactIdInput = z.object({ id: z.string() });

export const contactBulkInput = bulkIdsInput;

export const contactBulkOwnerInput = bulkIdsInput.extend({
	ownerId: z.string().nullable(),
});

export type ContactBulkOwnerInput = z.infer<typeof contactBulkOwnerInput>;

export const contactBulkCompanyInput = bulkIdsInput.extend({
	companyId: z.string().nullable(),
});

export type ContactBulkCompanyInput = z.infer<typeof contactBulkCompanyInput>;

export const factDecisionInput = z.object({
	factId: z.string(),
	decision: z.enum(["accept", "dismiss"]),
});

export type FactDecisionInput = z.infer<typeof factDecisionInput>;

const fieldValueOutput = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);

const fieldOptionOutput = z.object({
	id: z.string(),
	label: z.string(),
	position: z.number(),
});

const recordFieldOutput = z.object({
	id: z.string(),
	entity: z.enum(FIELD_ENTITIES),
	key: z.string(),
	label: z.string(),
	type: z.enum(FIELD_TYPES),
	typeLabel: z.string(),
	agentFilled: z.boolean(),
	agentBrief: z.string().nullable(),
	required: z.boolean(),
	showOnSheet: z.boolean(),
	showOnTable: z.boolean(),
	showOnFilter: z.boolean(),
	position: z.number(),
	archived: z.boolean(),
	options: z.array(fieldOptionOutput),
	value: fieldValueOutput,
});

const contactCompanyOutput = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string().nullable(),
	iconUrl: z.string().nullable(),
	iconDarkUrl: z.string().nullable(),
	iconTone: z.string().nullable(),
	logoUrl: z.string().nullable(),
});

const contactOwnerOutput = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

export const contactRowOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
	title: z.string().nullable(),
	imageUrl: z.string().nullable(),
	source: z.enum(
		Object.values(RecordSource) as [RecordSource, ...RecordSource[]],
	),
	company: contactCompanyOutput.nullable(),
	owner: contactOwnerOutput.nullable(),
	lastActivityAt: z.string().nullable(),
	createdAt: z.string(),
	archivedAt: z.string().nullable(),
	fields: z.record(z.string(), fieldValueOutput),
});

export type ContactRow = z.infer<typeof contactRowOutput>;

export const contactListOutput = z.object({
	rows: z.array(contactRowOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
});

const contactBriefSectionsOutput = z.object({
	currentRole: z.string().optional(),
	tenure: z.string().optional(),
	previousRoles: z.array(z.string()).optional(),
	seniority: z.string().optional(),
	function: z.string().optional(),
	location: z.string().optional(),
});

const contactBriefOutput = z.object({
	narrative: z.string(),
	sections: contactBriefSectionsOutput,
	score: z.number(),
	sourceUrl: z.string().nullable(),
	refreshedAt: z.string(),
});

const contactFactEvidenceOutput = z.object({
	kind: z.string(),
	detail: z.string(),
	sourceUrl: z.string().optional(),
});

const contactFactOutput = z.object({
	id: z.string(),
	field: z.string(),
	value: z.string(),
	score: z.number(),
	band: z.enum(Object.values(FactBand) as [FactBand, ...FactBand[]]),
	evidence: z.array(contactFactEvidenceOutput),
	method: z.string(),
	sourceUrl: z.string().nullable(),
	status: z.enum(Object.values(FactStatus) as [FactStatus, ...FactStatus[]]),
	observedAt: z.string(),
});

const contactRelationshipMeetingOutput = z.object({
	title: z.string(),
	startsAt: z.string(),
});

const contactRelationshipColleagueOutput = z.object({
	id: z.string(),
	name: z.string(),
	title: z.string().nullable(),
});

const contactRelationshipOutput = z.object({
	emails: z.number(),
	threads: z.number(),
	lastReplyAt: z.string().nullable(),
	meetings: z.number(),
	nextMeeting: contactRelationshipMeetingOutput.nullable(),
	colleagues: z.array(contactRelationshipColleagueOutput),
});

const contactDealOutput = z.object({
	id: z.string(),
	name: z.string(),
	stage: z.enum(Object.values(DealStage) as [DealStage, ...DealStage[]]),
	currency: z.string(),
	expectedCloseDate: z.string().nullable(),
	owner: contactOwnerOutput,
	role: z.string().nullable(),
	amountCents: z.number().nullable(),
});

export const contactByIdOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	title: z.string().nullable(),
	linkedinUrl: z.string().nullable(),
	twitterUrl: z.string().nullable(),
	githubUrl: z.string().nullable(),
	imageUrl: z.string().nullable(),
	enrichmentStatus: z.enum(
		Object.values(EnrichmentStatus) as [
			EnrichmentStatus,
			...EnrichmentStatus[],
		],
	),
	enrichmentError: z.string().nullable(),
	owner: contactOwnerOutput.nullable(),
	company: contactCompanyOutput
		.extend({
			industry: z.string().nullable(),
			primaryContactId: z.string().nullable(),
		})
		.nullable(),
	fields: z.array(recordFieldOutput),
	queued: z.boolean(),
	createdAt: z.string(),
	archivedAt: z.string().nullable(),
	brief: contactBriefOutput.nullable(),
	facts: z.array(contactFactOutput),
	relationship: contactRelationshipOutput,
	isPrimaryContact: z.boolean(),
	deals: z.array(contactDealOutput),
});

export const contactBasicOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
});

export const contactNameOutput = z.object({
	id: z.string(),
	name: z.string(),
});

export const contactEnrichOutput = z.object({
	id: z.string(),
	queued: z.literal(true),
});

export const bulkResultOutput = z.object({
	requested: z.number(),
	succeeded: z.number(),
	failed: z.number(),
	message: z.string().nullable(),
});

export const decideFactOutput = z.object({
	contactId: z.string(),
	field: z.string(),
	applied: z.boolean(),
});
