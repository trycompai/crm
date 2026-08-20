import { FIELD_ENTITIES } from "@crm/db/fields";
import { savedViewFilters } from "@crm/validation/saved-view";
import { z } from "zod";

export const savedViewEntity = z.enum(FIELD_ENTITIES);

export const savedViewListInput = z.object({
	entity: savedViewEntity,
});

export type SavedViewListInput = z.infer<typeof savedViewListInput>;

export const savedViewCreateInput = z.object({
	entity: savedViewEntity,
	name: z.string().trim().min(1, "A view needs a name.").max(120),
	shared: z.boolean().default(false),
	filters: savedViewFilters,
});

export type SavedViewCreateInput = z.infer<typeof savedViewCreateInput>;

const savedViewUpdateData = z.object({
	name: z.string().trim().min(1).max(120).optional(),
	shared: z.boolean().optional(),
	filters: savedViewFilters.optional(),
});

export type SavedViewUpdateData = z.infer<typeof savedViewUpdateData>;

export const savedViewUpdateArgs = z.object({
	id: z.string(),
	data: savedViewUpdateData,
});

export const savedViewIdInput = z.object({ id: z.string() });

export const savedViewOutput = z.object({
	id: z.string(),
	entity: savedViewEntity,
	name: z.string(),
	shared: z.boolean(),
	filters: savedViewFilters,
	mine: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type SavedView = z.infer<typeof savedViewOutput>;

export const savedViewListOutput = z.array(savedViewOutput);

export const savedViewDeleteOutput = z.object({ id: z.string() });
