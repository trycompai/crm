import { z } from "zod";

export const outreachProspectInput = z.object({
	prospectId: z.string().cuid(),
});

const clientRequestInput = z.object({
	clientRequestId: z.string().uuid(),
});

export const outreachProspectMutationInput =
	outreachProspectInput.merge(clientRequestInput);

export const outreachPermissionInput = outreachProspectInput
	.merge(clientRequestInput)
	.extend({
		allowed: z.boolean(),
	});

export const outreachDraftInput = z
	.object({ draftId: z.string().cuid() })
	.merge(clientRequestInput);

export const outreachSequenceInput = z
	.object({
		sequenceId: z.string().uuid(),
	})
	.merge(clientRequestInput);

export const leadDiscoveryTaskInput = z
	.object({
		taskId: z.string().cuid(),
	})
	.merge(clientRequestInput);

export const outreachUpdateInput = z
	.object({
		draftId: z.string().cuid(),
		subject: z.string().trim().min(1).max(240),
		plainTextBody: z.string().trim().min(1).max(12_000),
		scheduledFor: z.string().datetime(),
		expectedUpdatedAt: z.string().datetime(),
	})
	.merge(clientRequestInput);

export const leadDiscoveryInput = z.object({
	count: z.number().int().min(5).max(100).default(25),
	countryCodes: z
		.array(z.enum(["AU", "GB", "US"]))
		.min(1)
		.max(3)
		.default(["AU", "GB", "US"]),
	cohortName: z
		.string()
		.trim()
		.min(3)
		.max(120)
		.default("Landscaping operators"),
	budgetUsd: z.number().min(0).max(250).default(0),
	clientRequestId: z.string().uuid(),
});

export type LeadDiscoveryInput = z.infer<typeof leadDiscoveryInput>;
export type LeadDiscoveryTaskInput = z.infer<typeof leadDiscoveryTaskInput>;
