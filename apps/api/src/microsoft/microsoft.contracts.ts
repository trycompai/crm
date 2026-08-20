import { GoogleSyncStatus } from "@crm/db";
import { z } from "zod";
import { MICROSOFT_SYNC_SOURCES } from "./microsoft.constants";

export const setOutlookAutoCreateInput = z.object({
	source: z.enum(MICROSOFT_SYNC_SOURCES),
	enabled: z.boolean(),
});

export type SetOutlookAutoCreateInput = z.infer<
	typeof setOutlookAutoCreateInput
>;

const microsoftSyncStatusOutput = z.enum(
	Object.values(GoogleSyncStatus) as [GoogleSyncStatus, ...GoogleSyncStatus[]],
);

export const microsoftSourceStatusOutput = z.object({
	source: z.enum(MICROSOFT_SYNC_SOURCES),
	connected: z.boolean(),
	status: microsoftSyncStatusOutput.nullable(),
	lastSyncedAt: z.string().nullable(),
	lastError: z.string().nullable(),
	autoCreate: z.boolean(),
});

export const microsoftConnectionStatusOutput = z.object({
	configured: z.boolean(),
	linked: z.boolean(),
	required: z.boolean(),
	hasRefreshToken: z.boolean(),
	sources: z.array(microsoftSourceStatusOutput),
});

export const purgeSyncedDataOutput = z.object({
	purged: z.number(),
});

export const revokeAccessOutput = z.object({
	revoked: z.boolean(),
});

export type MicrosoftSourceStatus = z.infer<typeof microsoftSourceStatusOutput>;
export type MicrosoftConnectionStatus = z.infer<
	typeof microsoftConnectionStatusOutput
>;
export type PurgeSyncedDataOutput = z.infer<typeof purgeSyncedDataOutput>;
export type RevokeAccessOutput = z.infer<typeof revokeAccessOutput>;
