import { FIELD_ENTITIES, FIELD_TYPES } from "@crm/db/fields";
import { z } from "zod";

export const fieldEntity = z.enum(FIELD_ENTITIES);

export const fieldListInput = z.object({
	entity: fieldEntity,
	includeArchived: z.boolean().default(false),
});

export type FieldListInput = z.infer<typeof fieldListInput>;

export const fieldByKeyInput = z.object({
	entity: fieldEntity,
	key: z.string().trim().min(1),
});

const fieldOptionInput = z.object({
	id: z.string().optional(),
	label: z.string().trim().min(1, "An option needs a label."),
});

export const fieldCreateInput = z.object({
	entity: fieldEntity,
	label: z.string().trim().min(1, "A field needs a label."),
	type: z.enum(FIELD_TYPES),
	options: z.array(fieldOptionInput).default([]),
	agentFilled: z.boolean().default(true),
	agentBrief: z.string().trim().nullable().default(null),
	required: z.boolean().default(false),
	showOnSheet: z.boolean().default(true),
	showOnTable: z.boolean().default(false),
});

export type FieldCreateInput = z.infer<typeof fieldCreateInput>;

const fieldUpdateData = z.object({
	label: z.string().trim().min(1).optional(),
	type: z.enum(FIELD_TYPES).optional(),
	options: z.array(fieldOptionInput).optional(),
	agentFilled: z.boolean().optional(),
	agentBrief: z.string().trim().nullable().optional(),
	required: z.boolean().optional(),
	showOnSheet: z.boolean().optional(),
	showOnTable: z.boolean().optional(),
});

export type FieldUpdateData = z.infer<typeof fieldUpdateData>;

export const fieldUpdateArgs = z.object({
	id: z.string(),
	data: fieldUpdateData,
});

export const fieldIdInput = z.object({ id: z.string() });

export const fieldReorderInput = z.object({
	entity: fieldEntity,
	ids: z.array(z.string()).min(1),
});

export type FieldReorderInput = z.infer<typeof fieldReorderInput>;

const recordFieldValue = z.union(
	[z.string(), z.number(), z.boolean(), z.null()],
	{ error: "A field holds text, a number, true or false, or nothing at all." },
);

export const recordFieldValues = z.record(z.string(), recordFieldValue);
