import { z } from "zod";

export const granolaMatchInput = z.object({
	id: z.string(),
	companyId: z.string(),
	contactId: z.string().nullable().default(null),
	dealId: z.string().nullable().default(null),
});

export type GranolaMatchInput = z.infer<typeof granolaMatchInput>;

export const granolaExcludeInput = z.object({
	id: z.string(),
	reason: z.string().trim().min(1).max(240).default("Not relevant to Lode"),
});

export type GranolaExcludeInput = z.infer<typeof granolaExcludeInput>;
