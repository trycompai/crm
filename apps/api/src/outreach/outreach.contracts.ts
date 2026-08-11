import { z } from "zod";

export const outreachProspectInput = z.object({
	prospectId: z.string().cuid(),
});

export const outreachPermissionInput = outreachProspectInput.extend({
	allowed: z.boolean(),
});

export const outreachDraftInput = z.object({ draftId: z.string().cuid() });

export const outreachSequenceInput = z.object({
	sequenceId: z.string().uuid(),
});

export const outreachUpdateInput = z.object({
	draftId: z.string().cuid(),
	subject: z.string().trim().min(1).max(240),
	plainTextBody: z.string().trim().min(1).max(12_000),
});

export const leadDiscoveryInput = z.object({
	count: z.number().int().min(5).max(100).default(25),
	countryCodes: z
		.array(z.enum(["AU", "GB", "US"]))
		.min(1)
		.max(3)
		.default(["AU", "GB", "US"]),
});
