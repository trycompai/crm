import { z } from "zod";
import { opportunityRecommendation } from "./opportunity-ops.contracts";

export const guyanaOpportunitySource = z.enum([
	"government-eprocure",
	"npta",
	"local-content-register",
	"idb",
	"cdb",
	"ungm",
]);

export const guyanaElectricalRequirement = z.enum([
	"required",
	"preferred",
	"adjacent",
	"none",
	"unknown",
]);

export const guyanaElectricalScopeMatch = z.enum([
	"direct",
	"adjacent",
	"unknown",
	"none",
]);

export const guyanaElectricalLicenseStatus = z.enum([
	"verified",
	"unverified",
	"not-required",
]);

export const guyanaOpportunityCommercialComponents = z.object({
	activeNeed: z.number().min(0).max(20),
	commercialValue: z.number().min(0).max(15),
	timingUrgency: z.number().min(0).max(15),
	buyerAccess: z.number().min(0).max(10),
	strategicValue: z.number().min(0).max(10),
});

export const ingestGuyanaOpportunityInput = z
	.object({
		project: z.string().trim().min(1).max(96),
		source: guyanaOpportunitySource,
		sourceId: z.string().trim().min(1).max(320),
		sourceUrl: z.string().url(),
		observedAt: z.string().datetime({ offset: true }).nullable().optional(),
		buyer: z.string().trim().min(1).max(320),
		title: z.string().trim().min(1).max(500),
		description: z.string().trim().max(12000).nullable().optional(),
		deadline: z.string().datetime({ offset: true }).nullable().optional(),
		estimatedValue: z.number().nonnegative().nullable().optional(),
		currency: z.string().trim().min(3).max(8).nullable().optional(),
		opportunityType: z.string().trim().max(120).nullable().optional(),
		categories: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
		electrical: z.object({
			requirement: guyanaElectricalRequirement,
			scopeMatch: guyanaElectricalScopeMatch,
			licenseStatus: guyanaElectricalLicenseStatus,
			licenseEvidenceRef: z.string().trim().max(1000).nullable().optional(),
			licenseScopeNotes: z.string().trim().max(4000).nullable().optional(),
		}),
		components: guyanaOpportunityCommercialComponents,
		evidence: z.record(z.string(), z.string().max(4000)).default({}),
		rationale: z.string().trim().max(8000).nullable().optional(),
	})
	.superRefine((value, ctx) => {
		if (
			value.electrical.licenseStatus === "verified" &&
			!value.electrical.licenseEvidenceRef
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["electrical", "licenseEvidenceRef"],
				message: "Verified electrical-license status requires an evidence reference.",
			});
		}
	});

export const ingestGuyanaOpportunityOutput = z.object({
	sourceRecordId: z.string(),
	deduplicated: z.boolean(),
	score: z.number().int().min(0).max(100),
	recommendation: opportunityRecommendation,
	reviewState: z.literal("pending"),
	hardBlocked: z.boolean(),
	electricalLicenseApplied: z.boolean(),
	capabilityFit: z.number().min(0).max(30),
});

export type GuyanaOpportunitySource = z.infer<typeof guyanaOpportunitySource>;
export type IngestGuyanaOpportunityInput = z.infer<
	typeof ingestGuyanaOpportunityInput
>;
export type IngestGuyanaOpportunityOutput = z.infer<
	typeof ingestGuyanaOpportunityOutput
>;
