import { z } from "zod";

export const todayInput = z.object({
	limit: z.number().int().min(1).max(25).default(10),
});

export type TodayInput = z.infer<typeof todayInput>;
