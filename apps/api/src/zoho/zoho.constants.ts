export {
	SCOPE_FOR_SOURCE,
	ZOHO_ACCOUNTS_SCOPE,
	ZOHO_FOLDERS_SCOPE,
	ZOHO_MESSAGES_SCOPE,
	ZOHO_PROVIDER_ID,
	ZOHO_SYNC_SCOPES,
	ZOHO_SYNC_SOURCES,
	type ZohoSyncSource,
} from "../mailbox/mailbox.constants";

/** Zoho rejects `Bearer`; its APIs take this scheme instead. */
export const ZOHO_AUTH_SCHEME = "Zoho-oauthtoken";

/** Zoho caps `limit` at 200. Stay well under it — each hit costs two more
 * calls per message (headers, then content). */
export const ZOHO_PAGE_SIZE = 50;

/**
 * A tick reads at most this many messages. Zoho has no batch endpoint, so the
 * ceiling is three HTTP calls per message; keeping it modest keeps a tick
 * inside the sync service's per-tick budget.
 */
export const ZOHO_MAX_MESSAGES_PER_TICK = 60;

/**
 * Folders whose mail never belongs in a CRM. Matched on `folderType`, which is
 * Zoho's stable classification — `folderName` is user-renameable and localised.
 */
export const ZOHO_EXCLUDED_FOLDER_TYPES = [
	"Spam",
	"Trash",
	"Drafts",
	"Outbox",
	"Templates",
] as const;

/**
 * Zoho's own conversation id, used as a thread root only when the message
 * carries no `References`/`In-Reply-To` of its own. Prefixed so it can never
 * collide with a real RFC message id.
 */
export const ZOHO_THREAD_ROOT_PREFIX = "zoho-thread:";

/** DI token for the resolved data-centre endpoints, or null when unconfigured. */
export const ZOHO_ENDPOINTS = "ZOHO_ENDPOINTS";
