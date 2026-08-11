import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const marketingCampaignStatuses = [
	"DRAFT",
	"ACTIVE",
	"PAUSED",
	"COMPLETED",
	"ARCHIVED",
] as const;

export const marketingPlanInput = z.object({
	name: z.string().trim().min(1).max(180),
	channel: z.string().trim().min(1).max(80),
	objective: z.string().trim().max(1000).optional(),
	contentKind: z.string().trim().min(1).max(80).default("post"),
	contentTitle: z.string().trim().min(1).max(240),
	contentBody: z.string().trim().min(1).max(12_000),
	audience: z.string().trim().max(240).optional(),
	sourceUrl: z.string().trim().url().optional(),
	startsAt: z.string().datetime({ offset: true }).optional(),
	scheduledAt: z.string().datetime({ offset: true }).optional(),
	budgetAmount: z.number().nonnegative().max(1_000_000).default(0),
	currency: z.string().trim().length(3).default("USD"),
	clientRequestId: z.string().uuid(),
});

export const marketingListInput = listInput.extend({
	status: z.enum(["all", ...marketingCampaignStatuses]).default("all"),
	channel: z.string().trim().max(80).default("all"),
	owner: z.string().trim().max(120).default("all"),
});

export const marketingCampaignIdInput = z.object({ id: z.string().min(1) });

export type MarketingListInput = z.infer<typeof marketingListInput>;
export type MarketingPlanInput = z.infer<typeof marketingPlanInput>;
