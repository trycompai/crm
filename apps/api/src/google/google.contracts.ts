import { EmailDirection, GoogleSyncStatus } from "@crm/db";
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

const googleSyncStatusOutput = z.enum(
	Object.values(GoogleSyncStatus) as [GoogleSyncStatus, ...GoogleSyncStatus[]],
);

export const googleSourceStatusOutput = z.object({
	source: z.enum(GOOGLE_SYNC_SOURCES),
	connected: z.boolean(),
	status: googleSyncStatusOutput.nullable(),
	lastSyncedAt: z.string().nullable(),
	lastError: z.string().nullable(),
	autoCreate: z.boolean(),
});

export const googleConnectionStatusOutput = z.object({
	configured: z.boolean(),
	linked: z.boolean(),
	required: z.boolean(),
	hasRefreshToken: z.boolean(),
	sources: z.array(googleSourceStatusOutput),
});

export const purgeSyncedDataOutput = z.object({
	purged: z.number(),
});

export const revokeAccessOutput = z.object({
	revoked: z.boolean(),
});

export const suppressDomainOutput = z.object({
	domain: z.string(),
	purged: z.number(),
});

const emailThreadCompanyOutput = z.object({
	id: z.string(),
	name: z.string(),
});

const emailThreadContactOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
});

const emailThreadRecipientOutput = z.object({
	email: z.string(),
	name: z.string().nullable(),
	kind: z.string(),
});

const emailDirectionOutput = z.enum(
	Object.values(EmailDirection) as [EmailDirection, ...EmailDirection[]],
);

const emailThreadMessageOutput = z.object({
	id: z.string(),
	direction: emailDirectionOutput,
	fromEmail: z.string(),
	fromName: z.string().nullable(),
	recipients: z.array(emailThreadRecipientOutput),
	subject: z.string().nullable(),
	body: z.string().nullable(),
	snippet: z.string().nullable(),
	sentAt: z.string(),
	gmailMessageId: z.string().nullable(),
	outlookWebLink: z.string().nullable(),
	fromImageUrl: z.string().nullable(),
	mailboxUrl: z.string().nullable(),
	mailboxName: z.string().nullable(),
});

export const emailThreadOutput = z.object({
	id: z.string(),
	subject: z.string().nullable(),
	messageCount: z.number(),
	firstMessageAt: z.string(),
	lastMessageAt: z.string(),
	company: emailThreadCompanyOutput.nullable(),
	contact: emailThreadContactOutput.nullable(),
	messages: z.array(emailThreadMessageOutput),
});

const calendarEventCompanyOutput = z.object({
	id: z.string(),
	name: z.string(),
});

const calendarEventContactOutput = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string().nullable(),
});

const calendarAttendeeOutput = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	responseStatus: z.string().nullable(),
	isOrganizer: z.boolean(),
	contactId: z.string().nullable(),
	imageUrl: z.string().nullable(),
});

export const calendarEventOutput = z.object({
	id: z.string(),
	title: z.string().nullable(),
	description: z.string().nullable(),
	location: z.string().nullable(),
	conferenceUrl: z.string().nullable(),
	startsAt: z.string(),
	endsAt: z.string(),
	isAllDay: z.boolean(),
	status: z.string(),
	organizerEmail: z.string().nullable(),
	company: calendarEventCompanyOutput.nullable(),
	contact: calendarEventContactOutput.nullable(),
	attendees: z.array(calendarAttendeeOutput),
});

export type GoogleSourceStatus = z.infer<typeof googleSourceStatusOutput>;
export type GoogleConnectionStatus = z.infer<
	typeof googleConnectionStatusOutput
>;
export type PurgeSyncedDataOutput = z.infer<typeof purgeSyncedDataOutput>;
export type RevokeAccessOutput = z.infer<typeof revokeAccessOutput>;
export type SuppressDomainOutput = z.infer<typeof suppressDomainOutput>;
export type EmailThreadOutput = z.infer<typeof emailThreadOutput>;
export type CalendarEventOutput = z.infer<typeof calendarEventOutput>;
