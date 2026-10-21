import { z } from "zod";

// Every Zoho Mail response is wrapped in `{ status: { code, description }, data }`.
// The HTTP status is usually right, but not always — parse the envelope and
// trust `status.code`, then parse `data` into the shape the caller asked for.
export const envelope = z.object({
	status: z.object({
		code: z.number(),
		description: z.string().optional(),
	}),
	data: z.unknown().optional(),
});

// Zoho hands numeric ids back as either a JSON number or a string, sometimes
// varying between endpoints for the same id. They are opaque to us, so coerce
// every one of them to a string once, here, and never think about it again.
const id = z.union([z.string(), z.number()]).transform(String);

// Timestamps arrive as epoch milliseconds in a string ("1709887053409").
const epochMillis = z
	.union([z.string(), z.number()])
	.transform((value) => Number(value))
	.refine((value) => Number.isFinite(value) && value > 0, {
		message: "Not an epoch timestamp.",
	});

const optionalEpochMillis = epochMillis.optional().catch(undefined);

// `Not Provided` is Zoho's literal string for an absent address list.
const NOT_PROVIDED = "Not Provided";

const addressLine = z
	.string()
	.optional()
	.transform((value) => {
		const trimmed = value?.trim();
		if (!trimmed || trimmed === NOT_PROVIDED) return null;
		return trimmed;
	});

export const oauthToken = z.object({
	access_token: z.string().min(1).optional(),
	refresh_token: z.string().min(1).optional(),
	token_type: z.string().optional(),
	scope: z.string().optional(),
	// Zoho has shipped this both as seconds and as milliseconds across API
	// versions. The caller normalises; the schema only insists it is a number.
	expires_in: z.number().optional(),
	error: z.string().optional(),
});

export type ZohoOAuthToken = z.infer<typeof oauthToken>;

export const userInfo = z.object({
	ZUID: z.union([z.string(), z.number()]).transform(String),
	Email: z.string().email(),
	Display_Name: z.string().optional(),
	First_Name: z.string().optional(),
	Last_Name: z.string().optional(),
});

export type ZohoUserInfo = z.infer<typeof userInfo>;

export const account = z.object({
	accountId: id,
	// `mailboxAddress` is the address that actually receives mail;
	// `primaryEmailAddress` is what the UI shows. They differ on aliases.
	mailboxAddress: z.string().optional(),
	primaryEmailAddress: z.string().optional(),
	// "ZOHO_ACCOUNT" for a real Zoho mailbox, "IMAP_ACCOUNT" for an external
	// mailbox that has been POP/IMAP-attached. Only the former is syncable.
	type: z.string().optional(),
	enabled: z.boolean().optional(),
	accountDisplayName: z.string().optional(),
});

export type ZohoAccount = z.infer<typeof account>;

export const accounts = z.array(account);

export const folder = z.object({
	folderId: id,
	folderName: z.string(),
	// "Inbox" | "Sent" | "Drafts" | "Spam" | "Trash" | "Outbox" | "Templates"…
	// A user-made folder reports the type of the folder it lives under, so this
	// cannot be used to identify a specific folder — only to exclude classes.
	folderType: z.string().optional(),
	path: z.string().optional(),
});

export type ZohoFolder = z.infer<typeof folder>;

export const folders = z.array(folder);

export const messageSummary = z.object({
	messageId: id,
	folderId: id,
	threadId: id.optional(),
	subject: z.string().optional(),
	summary: z.string().optional(),
	fromAddress: z.string().optional(),
	sender: z.string().optional(),
	toAddress: addressLine,
	ccAddress: addressLine,
	sentDateInGMT: optionalEpochMillis,
	receivedTime: optionalEpochMillis,
	hasAttachment: z.union([z.string(), z.number()]).optional(),
});

export type ZohoMessageSummary = z.infer<typeof messageSummary>;

export const messageList = z.array(messageSummary);

// `messageId` is deliberately absent from this shape and the one below. Zoho
// returns it here as a bare JSON number — `1710915488416100000` — which is past
// `Number.MAX_SAFE_INTEGER`, so `JSON.parse` has already rounded it by the time
// any schema sees it. The list endpoint returns the same id as a string, and
// that is the copy every caller uses.
export const messageContent = z.object({
	content: z.string().optional(),
	blockContent: z.string().optional(),
});

export type ZohoMessageContent = z.infer<typeof messageContent>;

// `?raw=false` returns headers as a name -> values map. Header names keep the
// casing the sending server used, so the reader lower-cases before lookup.
export const messageHeaders = z.object({
	headerContent: z.record(z.string(), z.array(z.string())),
});

export type ZohoMessageHeaders = z.infer<typeof messageHeaders>;
