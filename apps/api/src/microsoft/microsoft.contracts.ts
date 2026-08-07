import { z } from "zod";
import { MICROSOFT_SYNC_SOURCES } from "./microsoft.constants";

export const setOutlookAutoCreateInput = z.object({
	source: z.enum(MICROSOFT_SYNC_SOURCES),
	enabled: z.boolean(),
});

export type SetOutlookAutoCreateInput = z.infer<
	typeof setOutlookAutoCreateInput
>;
