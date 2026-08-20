import { z } from "zod";

export const ENRICHMENT_PAGE = 20;

export const ENRICHMENT_PAGE_MAX = 200;

export const enrichmentQueueInput = z.object({
	limit: z
		.number()
		.int()
		.min(1)
		.max(ENRICHMENT_PAGE_MAX)
		.default(ENRICHMENT_PAGE),
});

export type EnrichmentQueueInput = z.infer<typeof enrichmentQueueInput>;

export function pageSize(limit: number): number {
	if (!Number.isFinite(limit)) return ENRICHMENT_PAGE;

	return Math.min(Math.max(1, Math.trunc(limit)), ENRICHMENT_PAGE_MAX);
}
