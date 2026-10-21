import { GoogleSyncStatus } from "@crm/db";
import { z } from "zod";
import { ZOHO_SYNC_SOURCES } from "./zoho.constants";

export const setZohoAutoCreateInput = z.object({
	source: z.enum(ZOHO_SYNC_SOURCES),
	enabled: z.boolean(),
});

export type SetZohoAutoCreateInput = z.infer<typeof setZohoAutoCreateInput>;

const zohoSyncStatusOutput = z.enum(
	Object.values(GoogleSyncStatus) as [GoogleSyncStatus, ...GoogleSyncStatus[]],
);

export const zohoSourceStatusOutput = z.object({
	source: z.enum(ZOHO_SYNC_SOURCES),
	connected: z.boolean(),
	status: zohoSyncStatusOutput.nullable(),
	lastSyncedAt: z.string().nullable(),
	lastError: z.string().nullable(),
	autoCreate: z.boolean(),
});

export const zohoConnectionStatusOutput = z.object({
	configured: z.boolean(),
	linked: z.boolean(),
	required: z.boolean(),
	hasRefreshToken: z.boolean(),
	sources: z.array(zohoSourceStatusOutput),
});

export const zohoPurgeSyncedDataOutput = z.object({
	purged: z.number(),
});

export const zohoRevokeAccessOutput = z.object({
	revoked: z.boolean(),
});

export type ZohoSourceStatus = z.infer<typeof zohoSourceStatusOutput>;
export type ZohoConnectionStatus = z.infer<typeof zohoConnectionStatusOutput>;
export type ZohoPurgeSyncedDataOutput = z.infer<
	typeof zohoPurgeSyncedDataOutput
>;
export type ZohoRevokeAccessOutput = z.infer<typeof zohoRevokeAccessOutput>;
