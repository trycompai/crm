import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const prospectListInput = listInput.extend({
	countryCode: z.string().default("all"),
	status: z.string().default("all"),
	routeStatus: z.string().default("all"),
	contact: z.string().default("all"),
});

export type ProspectListInput = z.infer<typeof prospectListInput>;

export const prospectIdInput = z.object({ id: z.string().cuid() });

export const prospectIdsInput = z.object({
	ids: z.array(z.string().cuid()).min(1).max(500),
});

export const prospectGapInput = z.object({
	limit: z.number().int().min(1).max(500).default(100),
});

export const prospectDraftInput = z.object({
	id: z.string().cuid(),
	draftSubject: z.string().trim().min(1).max(240),
	draftBody: z.string().trim().min(1).max(12_000),
});
