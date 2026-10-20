import { z } from "zod";

export const opportunityRecommendation = z.enum([
	"pursue",
	"qualify",
	"watch",
	"pass",
]);

export const opportunityReviewState = z.enum([
	"pending",
	"approved",
	"rejected",
	"watch",
	"promoted",
]);

export const opportunityScoreComponents = z.object({
	capabilityFit: z.number().min(0).max(30),
	activeNeed: z.number().min(0).max(20),
	commercialValue: z.number().min(0).max(15),
	timingUrgency: z.number().min(0).max(15),
	buyerAccess: z.number().min(0).max(10),
	strategicValue: z.number().min(0).max(10),
});

export const evaluateOpportunityInput = z.object({
	sourceRecordId: z.string().trim().min(1),
	components: opportunityScoreComponents,
	evidence: z.record(z.string(), z.string().max(4000)).default({}),
	rationale: z.string().trim().max(8000).nullable().optional(),
	hardBlockers: z
		.array(
			z.enum([
				"expired_deadline",
				"eligibility_mismatch",
				"geography_ineligible",
				"mandatory_requirement_gap",
				"deadline_not_feasible",
				"registration_not_feasible",
				"unacceptable_mandatory_terms",
				"low_source_trust",
			]),
		)
		.default([]),
});

export const evaluateOpportunityOutput = z.object({
	sourceRecordId: z.string(),
	reviewEventId: z.string(),
	score: z.number().int().min(0).max(100),
	recommendation: opportunityRecommendation,
	state: z.literal("pending"),
	hardBlocked: z.boolean(),
});

export const decideOpportunityInput = z.object({
	sourceRecordId: z.string().trim().min(1),
	reviewerUserId: z.string().trim().min(1),
	decision: z.enum(["approved", "rejected", "watch"]),
	recommendation: opportunityRecommendation.optional(),
	rationale: z.string().trim().min(1).max(8000),
});

export const decideOpportunityOutput = z.object({
	sourceRecordId: z.string(),
	reviewEventId: z.string(),
	state: z.enum(["approved", "rejected", "watch"]),
	recommendation: opportunityRecommendation.nullable(),
	score: z.number().int().min(0).max(100).nullable(),
});

export const opportunityReviewQueueInput = z.object({
	project: z.string().trim().min(1).max(96).optional(),
	state: z
		.enum(["all", "pending", "approved", "rejected", "watch", "promoted"])
		.default("pending"),
	minScore: z.number().int().min(0).max(100).optional(),
	limit: z.number().int().min(1).max(200).default(50),
});

export const opportunityReviewQueueItem = z.object({
	sourceRecordId: z.string(),
	businessUnitKey: z.string(),
	businessUnitName: z.string(),
	sourceSystem: z.string(),
	sourceType: z.string(),
	sourceId: z.string(),
	sourceUrl: z.string().nullable(),
	companyName: z.string().nullable(),
	opportunityId: z.string().nullable(),
	opportunityName: z.string().nullable(),
	reviewState: opportunityReviewState,
	recommendation: opportunityRecommendation.nullable(),
	score: z.number().int().min(0).max(100).nullable(),
	rationale: z.string().nullable(),
	reviewerUserId: z.string().nullable(),
	decidedAt: z.string().nullable(),
	visibleDealId: z.string().nullable(),
});

export const opportunityReviewQueueOutput = z.object({
	rows: z.array(opportunityReviewQueueItem),
	count: z.number().int().nonnegative(),
});

export type OpportunityRecommendation = z.infer<
	typeof opportunityRecommendation
>;
export type OpportunityScoreComponents = z.infer<
	typeof opportunityScoreComponents
>;
export type EvaluateOpportunityInput = z.infer<typeof evaluateOpportunityInput>;
export type EvaluateOpportunityOutput = z.infer<typeof evaluateOpportunityOutput>;
export type DecideOpportunityInput = z.infer<typeof decideOpportunityInput>;
export type DecideOpportunityOutput = z.infer<typeof decideOpportunityOutput>;
export type OpportunityReviewQueueInput = z.infer<
	typeof opportunityReviewQueueInput
>;
export type OpportunityReviewQueueOutput = z.infer<
	typeof opportunityReviewQueueOutput
>;
