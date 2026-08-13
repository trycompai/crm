import { z } from "zod";

export const activityMetaFields = z.record(z.string(), z.json());

export type ActivityMetaFields = z.infer<typeof activityMetaFields>;

export const activityMeta = activityMetaFields.nullable().catch(null);

export type ActivityMeta = z.infer<typeof activityMeta>;
