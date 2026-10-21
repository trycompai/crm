import {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	type MailboxProviderId,
	MICROSOFT_PROVIDER_ID,
	OUTLOOK_MAIL_SCOPE,
	ZOHO_MESSAGES_SCOPE,
	ZOHO_PROVIDER_ID,
} from "@crm/auth";

export {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	type MailboxProviderId,
	MICROSOFT_PROVIDER_ID,
	MICROSOFT_SYNC_SCOPES,
	OUTLOOK_MAIL_SCOPE,
	SYNC_SCOPES,
	ZOHO_ACCOUNTS_SCOPE,
	ZOHO_FOLDERS_SCOPE,
	ZOHO_MESSAGES_SCOPE,
	ZOHO_PROVIDER_ID,
	ZOHO_SYNC_SCOPES,
} from "@crm/auth";

export const SYNC_SOURCES = [
	"calendar",
	"gmail",
	"outlook",
	"zohomail",
] as const;
export type SyncSource = (typeof SYNC_SOURCES)[number];

export const GOOGLE_SYNC_SOURCES = ["calendar", "gmail"] as const;
export const MICROSOFT_SYNC_SOURCES = ["outlook"] as const;
export const ZOHO_SYNC_SOURCES = ["zohomail"] as const;

export type GoogleSyncSource = (typeof GOOGLE_SYNC_SOURCES)[number];
export type MicrosoftSyncSource = (typeof MICROSOFT_SYNC_SOURCES)[number];
export type ZohoSyncSource = (typeof ZOHO_SYNC_SOURCES)[number];

export function isGoogleSyncSource(source: string): source is GoogleSyncSource {
	return (GOOGLE_SYNC_SOURCES as readonly string[]).includes(source);
}

export function isMicrosoftSyncSource(
	source: string,
): source is MicrosoftSyncSource {
	return (MICROSOFT_SYNC_SOURCES as readonly string[]).includes(source);
}

export function isZohoSyncSource(source: string): source is ZohoSyncSource {
	return (ZOHO_SYNC_SOURCES as readonly string[]).includes(source);
}

// One scope per source: the one that, on its own, proves the source can be
// read. Zoho needs three scopes to work, but `messages.READ` is the one that
// distinguishes "mail is connected" from "the user only linked their profile".
export const SCOPE_FOR_SOURCE = {
	calendar: CALENDAR_SCOPE,
	gmail: GMAIL_SCOPE,
	outlook: OUTLOOK_MAIL_SCOPE,
	zohomail: ZOHO_MESSAGES_SCOPE,
} satisfies Record<SyncSource, string>;

export const PROVIDER_FOR_SOURCE = {
	calendar: GOOGLE_PROVIDER_ID,
	gmail: GOOGLE_PROVIDER_ID,
	outlook: MICROSOFT_PROVIDER_ID,
	zohomail: ZOHO_PROVIDER_ID,
} satisfies Record<SyncSource, MailboxProviderId>;
