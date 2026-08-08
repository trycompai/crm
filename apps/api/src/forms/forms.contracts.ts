import { FormFieldType, FormStatus } from "@crm/db";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

const statusEnum = z.enum(
	Object.values(FormStatus) as [FormStatus, ...FormStatus[]],
);
const typeEnum = z.enum(
	Object.values(FormFieldType) as [FormFieldType, ...FormFieldType[]],
);

export const formListInput = listInput.extend({
	status: z.string().default("all"),
	clientAccountId: z.string().default("all"),
});

export type FormListInput = z.infer<typeof formListInput>;

export const formFieldInput = z.object({
	key: z
		.string()
		.trim()
		.min(1)
		.regex(/^[a-z][a-z0-9_]*$/i, "lowercase letters, numbers, underscores"),
	label: z.string().trim().min(1),
	type: typeEnum,
	required: z.boolean().default(false),
	placeholder: z.string().nullable().optional(),
	helpText: z.string().nullable().optional(),
	options: z.array(z.string()).default([]),
	position: z.number().int().min(0),
});

export type FormFieldInput = z.infer<typeof formFieldInput>;

export const formCreateInput = z.object({
	name: z.string().trim().min(1),
	slug: z.string().trim().min(1).optional(),
	description: z.string().nullable().optional(),
	status: statusEnum.optional(),
	redirectUrl: z.string().url().nullable().optional(),
	submitButtonLabel: z.string().optional(),
	successMessage: z.string().optional(),
	clientAccountId: z.string().nullable().optional(),
	createDeal: z.boolean().optional(),
	dealStage: z.string().nullable().optional(),
	tagsToApply: z.array(z.string()).optional(),
	workflowIdOnSubmit: z.string().nullable().optional(),
	fields: z.array(formFieldInput).default([]),
});

export type FormCreateInput = z.infer<typeof formCreateInput>;

export const formUpdateArgs = z.object({
	id: z.string(),
	data: formCreateInput.partial().extend({
		fields: z.array(formFieldInput).optional(),
	}),
});

export const formIdInput = z.object({ id: z.string() });

export const formSubmissionListInput = listInput.extend({
	formId: z.string(),
});

export const formPublicSubmitInput = z.object({
	slug: z.string(),
	data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
