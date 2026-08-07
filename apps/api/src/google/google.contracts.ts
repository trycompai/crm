import { z } from "zod";
import { GOOGLE_SYNC_SOURCES } from "./google.constants";

export const setAutoCreateInput = z.object({
	source: z.enum(GOOGLE_SYNC_SOURCES),
	enabled: z.boolean(),
});

export const suppressDomainInput = z.object({
	domain: z.string().trim().min(1),
	reason: z.string().trim().max(200).optional(),
	purge: z.boolean().default(true),
});

export const threadInput = z.object({
	threadId: z.string(),
});

export const calendarEventInput = z.object({
	eventId: z.string(),
});

export type SetAutoCreateInput = z.infer<typeof setAutoCreateInput>;
export type SuppressDomainInput = z.infer<typeof suppressDomainInput>;
