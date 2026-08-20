import { API_KEY_EXPIRATION } from "@crm/auth";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const apiKeyListInput = listInput;

export const createApiKeyInput = z.object({
	name: z.string().trim().min(1).max(64),
	expiresInDays: z
		.number()
		.int()
		.min(API_KEY_EXPIRATION.minDays)
		.max(API_KEY_EXPIRATION.maxDays)
		.nullable(),
});

export const revokeApiKeyInput = z.object({
	id: z.string().trim().min(1),
});

export const apiKeySummaryOutput = z.object({
	id: z.string(),
	name: z.string().nullable(),
	start: z.string().nullable(),
	enabled: z.boolean(),
	createdAt: z.string(),
	lastRequest: z.string().nullable(),
	expiresAt: z.string().nullable(),
});

export const apiKeyListOutput = z.object({
	rows: z.array(apiKeySummaryOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
});

export const createApiKeyOutput = apiKeySummaryOutput.extend({
	key: z.string(),
});

export const revokeApiKeyOutput = z.object({ id: z.string() });

export type ApiKeyListInput = z.infer<typeof apiKeyListInput>;
export type CreateApiKeyInput = z.infer<typeof createApiKeyInput>;
export type RevokeApiKeyInput = z.infer<typeof revokeApiKeyInput>;
export type ApiKeySummary = z.infer<typeof apiKeySummaryOutput>;
export type CreatedApiKey = z.infer<typeof createApiKeyOutput>;
