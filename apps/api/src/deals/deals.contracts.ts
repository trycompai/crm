import { DealStage } from "@crm/db";
import { FIELD_ENTITIES, FIELD_TYPES } from "@crm/db/fields";
import { z } from "zod";
import { bulkIdsInput } from "../crm/bulk";
import { currencyCode } from "../currency/currency.contracts";
import { recordFieldValues } from "../fields/fields.contracts";
import { listInput } from "../trpc/list-input";

export const MAX_AMOUNT_CENTS = 99_999_999_999_999;

const amountCents = z
	.number()
	.int()
	.min(0)
	.max(MAX_AMOUNT_CENTS, "That amount is too large to record.")
	.nullable()
	.optional();

export const CLOSING_WINDOWS = [
	"overdue",
	"this-month",
	"next-month",
	"later",
	"none",
] as const;

export type ClosingWindow = (typeof CLOSING_WINDOWS)[number];

export const dealListInput = listInput.extend({
	status: z.string().default("all"),
	owner: z.array(z.string()).default([]),
	stage: z.array(z.string()).default([]),
	closing: z.array(z.string()).default([]),
	fields: z.record(z.string(), z.array(z.string())).default({}),
	archived: z.boolean().default(false),
});

export type DealListInput = z.infer<typeof dealListInput>;

const stageEnum = z.enum(
	Object.values(DealStage) as [DealStage, ...DealStage[]],
);

export const dealCreateInput = z.object({
	name: z.string().trim().min(1, "A deal needs a name."),
	companyId: z.string().min(1, "A deal belongs to a company."),
	ownerId: z.string().min(1, "A deal needs an owner."),
	stage: stageEnum.optional(),
	amountCents,
	currency: currencyCode.optional(),
	expectedCloseDate: z.string().nullable().optional(),
});

export type DealCreateInput = z.infer<typeof dealCreateInput>;

const dealUpdateInput = z.object({
	name: z.string().trim().min(1).optional(),
	description: z.string().nullable().optional(),
	companyId: z.string().optional(),
	ownerId: z.string().optional(),
	amountCents,
	currency: currencyCode.optional(),
	expectedCloseDate: z.string().nullable().optional(),
	fields: recordFieldValues.optional(),
});

export type DealUpdateInput = z.infer<typeof dealUpdateInput>;

export const dealUpdateArgs = z.object({
	id: z.string(),
	data: dealUpdateInput,
});

export const dealIdInput = z.object({ id: z.string() });

export const setStageInput = z.object({
	id: z.string(),
	stage: stageEnum,
	closedReason: z.string().trim().optional(),
});

export type SetStageInput = z.infer<typeof setStageInput>;

const dealContactRole = z
	.string()
	.trim()
	.max(80, "That role is too long.")
	.nullable();

export const dealContactsInput = z.object({ dealId: z.string() });

export const dealAttachContactInput = z.object({
	dealId: z.string(),
	contactId: z.string().min(1, "Choose somebody to bring onto the deal."),
	role: dealContactRole.optional(),
});

export type DealAttachContactInput = z.infer<typeof dealAttachContactInput>;

export const dealDetachContactInput = z.object({
	dealId: z.string(),
	contactId: z.string(),
});

export type DealDetachContactInput = z.infer<typeof dealDetachContactInput>;

export const dealContactRoleInput = z.object({
	dealId: z.string(),
	contactId: z.string(),
	role: dealContactRole,
});

export type DealContactRoleInput = z.infer<typeof dealContactRoleInput>;

export const dealBulkInput = bulkIdsInput;

export const dealBulkOwnerInput = bulkIdsInput.extend({
	ownerId: z.string().min(1, "A deal needs an owner."),
});

export type DealBulkOwnerInput = z.infer<typeof dealBulkOwnerInput>;

export const dealBulkStageInput = bulkIdsInput.extend({
	stage: stageEnum,
	closedReason: z.string().trim().optional(),
});

export type DealBulkStageInput = z.infer<typeof dealBulkStageInput>;

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

const dealOwnerOutput = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

const dealCompanyOutput = z.object({
	id: z.string(),
	name: z.string(),
	domain: z.string().nullable(),
	iconUrl: z.string().nullable(),
	iconDarkUrl: z.string().nullable(),
	iconTone: z.string().nullable(),
	logoUrl: z.string().nullable(),
});

const dealCompanyDetailOutput = dealCompanyOutput.extend({
	industry: z.string().nullable(),
});

const dealContactSummaryOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
	title: z.string().nullable(),
	imageUrl: z.string().nullable(),
});

const dealContactOutput = dealContactSummaryOutput.extend({
	role: z.string().nullable(),
});

const dealListRowOutput = z.object({
	id: z.string(),
	name: z.string(),
	stage: stageEnum,
	currency: z.string(),
	company: dealCompanyOutput,
	owner: dealOwnerOutput,
	amountCents: z.number().nullable(),
	baseAmountCents: z.number().nullable(),
	expectedCloseDate: z.string().nullable(),
	closedAt: z.string().nullable(),
	lastActivityAt: z.string().nullable(),
	createdAt: z.string(),
	archivedAt: z.string().nullable(),
	fields: z.record(z.string(), fieldValueOutput),
});

export const dealListOutput = z.object({
	rows: z.array(dealListRowOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
	openValueCents: z.number().nullable(),
	reportingCurrency: z.string(),
	unconverted: z.object({
		count: z.number(),
		currencies: z.array(z.string()),
	}),
});

export type DealListResult = z.infer<typeof dealListOutput>;

export const dealDetailOutput = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	stage: stageEnum,
	currency: z.string(),
	closedReason: z.string().nullable(),
	company: dealCompanyDetailOutput,
	owner: dealOwnerOutput,
	fields: z.array(recordFieldOutput),
	amountCents: z.number().nullable(),
	baseAmountCents: z.number().nullable(),
	reportingCurrency: z.string(),
	fxRate: z.number().nullable(),
	fxRateAt: z.string().nullable(),
	stageChangedAt: z.string(),
	expectedCloseDate: z.string().nullable(),
	closedAt: z.string().nullable(),
	createdAt: z.string(),
	archivedAt: z.string().nullable(),
	contacts: z.array(dealContactOutput),
});

export type DealDetail = z.infer<typeof dealDetailOutput>;

export const dealCreateOutput = z.object({
	id: z.string(),
	name: z.string(),
	companyId: z.string(),
});

export type DealCreated = z.infer<typeof dealCreateOutput>;

export const dealMutateOutput = z.object({
	id: z.string(),
	name: z.string(),
});

export type DealMutated = z.infer<typeof dealMutateOutput>;

export const dealSetStageOutput = z.object({
	id: z.string(),
	stage: stageEnum,
	changed: z.boolean(),
});

export type DealSetStageResult = z.infer<typeof dealSetStageOutput>;

export const dealContactOptionsOutput = z.array(dealContactSummaryOutput);

export type DealContactOption = z.infer<typeof dealContactSummaryOutput>;

export const dealContactLinkOutput = z.object({
	dealId: z.string(),
	contactId: z.string(),
});

export type DealContactLink = z.infer<typeof dealContactLinkOutput>;

export const dealContactRoleOutput = z.object({
	dealId: z.string(),
	contactId: z.string(),
	role: z.string().nullable(),
});

export type DealContactRoleResult = z.infer<typeof dealContactRoleOutput>;

export const dealBulkResultOutput = z.object({
	requested: z.number(),
	succeeded: z.number(),
	failed: z.number(),
	message: z.string().nullable(),
});

export type DealBulkResult = z.infer<typeof dealBulkResultOutput>;
