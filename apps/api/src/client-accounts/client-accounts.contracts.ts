import { ClientAccountStatus } from "@crm/db";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

const statusEnum = z.enum(
	Object.values(ClientAccountStatus) as [
		ClientAccountStatus,
		...ClientAccountStatus[],
	],
);

export const clientAccountListInput = listInput.extend({
	status: z.string().default("all"),
});

export type ClientAccountListInput = z.infer<typeof clientAccountListInput>;

export const clientAccountCreateInput = z.object({
	name: z.string().trim().min(1, "A client needs a name."),
	slug: z
		.string()
		.trim()
		.min(1)
		.regex(/^[a-z0-9-]+$/i, "Lowercase letters, numbers and dashes only.")
		.optional(),
	status: statusEnum.optional(),
	logoUrl: z.string().url().nullable().optional(),
	brandColor: z.string().nullable().optional(),
	website: z.string().url().nullable().optional(),
	industry: z.string().nullable().optional(),
	timezone: z.string().nullable().optional(),
	monthlyRetainerCents: z.number().int().nonnegative().nullable().optional(),
	currency: z.string().length(3).optional(),
	tags: z.array(z.string()).optional(),
	notes: z.string().nullable().optional(),
});

export type ClientAccountCreateInput = z.infer<typeof clientAccountCreateInput>;

const clientAccountUpdateInput = clientAccountCreateInput.partial();

export const clientAccountUpdateArgs = z.object({
	id: z.string(),
	data: clientAccountUpdateInput,
});

export const clientAccountIdInput = z.object({ id: z.string() });

export const clientAccountStatsInput = z.object({ id: z.string() });
