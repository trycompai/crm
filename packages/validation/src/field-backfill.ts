import { z } from "zod";

export const fieldBackfillPayload = z.object({
	entity: z.enum(["COMPANY", "CONTACT", "DEAL"]),
	keys: z.array(z.string()).min(1),
});

export type FieldBackfillPayload = z.infer<typeof fieldBackfillPayload>;
