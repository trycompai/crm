import { CALENDAR_SCOPE, GMAIL_SCOPE } from "@crm/auth";

export {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	SYNC_SCOPES,
} from "@crm/auth";

export const SYNC_SOURCES = ["calendar", "gmail"] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];

export const SCOPE_FOR_SOURCE: Record<SyncSource, string> = {
	calendar: CALENDAR_SCOPE,
	gmail: GMAIL_SCOPE,
};
