import { DealStage } from "@crm/db";
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
	owner: z.string().default("all"),
	stage: z.string().default("all"),
	closing: z.string().default("all"),
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
