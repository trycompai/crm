import { z } from "zod";

const trimmed = z.string().trim().min(1);

export const tokenGrant = z.object({
	access_token: trimmed,
	refresh_token: trimmed,
	expires_in: z.number().int().positive(),
	token_type: z.string().optional(),
});

export type TokenGrant = z.infer<typeof tokenGrant>;

export const accessTokenInfo = z.object({
	hub_id: z.union([z.number().int(), trimmed]).transform(String),
	hub_domain: z.string().trim().optional(),
	user: z.string().trim().optional(),
	user_id: z.union([z.number().int(), trimmed]).transform(String).optional(),
	scopes: z.array(z.string().trim()).default([]),
	expires_in: z.number().int().optional(),
});

export type AccessTokenInfo = z.infer<typeof accessTokenInfo>;

export const errorBody = z.object({
	status: z.string().optional(),
	message: z.string().optional(),
	category: z.string().optional(),
	correlationId: z.string().optional(),
});

export type ErrorBody = z.infer<typeof errorBody>;

const numeric = z.union([z.number(), trimmed]).pipe(z.coerce.number());

const boolish = z
	.union([z.boolean(), z.string().trim()])
	.transform((value) =>
		typeof value === "boolean" ? value : value.toLowerCase() === "true",
	);

export const pipelineStage = z.object({
	id: trimmed,
	label: trimmed,
	displayOrder: numeric.default(0),
	archived: z.boolean().default(false),
	metadata: z
		.object({
			isClosed: boolish.default(false),
			probability: numeric.default(0),
		})
		.default({ isClosed: false, probability: 0 }),
});

export type PipelineStage = z.infer<typeof pipelineStage>;

export const pipeline = z.object({
	id: trimmed,
	label: trimmed,
	displayOrder: numeric.default(0),
	archived: z.boolean().default(false),
	stages: z.array(pipelineStage).default([]),
});

export type Pipeline = z.infer<typeof pipeline>;

export const pipelinesPage = z.object({
	results: z.array(pipeline).default([]),
});

export type PipelinesPage = z.infer<typeof pipelinesPage>;

export const dealRecord = z.object({
	id: trimmed,
	properties: z.record(z.string(), z.string().nullable()).default({}),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	archived: z.boolean().default(false),
});

export type DealRecord = z.infer<typeof dealRecord>;

export const dealsPage = z.object({
	results: z.array(dealRecord).default([]),
	paging: z
		.object({ next: z.object({ after: trimmed }).optional() })
		.optional(),
	total: z.number().int().optional(),
});

export type DealsPage = z.infer<typeof dealsPage>;

export const owner = z.object({
	id: trimmed,
	email: z.string().trim().optional(),
	firstName: z.string().trim().optional(),
	lastName: z.string().trim().optional(),
	archived: z.boolean().default(false),
});

export type Owner = z.infer<typeof owner>;

export const ownersPage = z.object({
	results: z.array(owner).default([]),
});

export type OwnersPage = z.infer<typeof ownersPage>;
