import { Injectable } from "@nestjs/common";
import {
	MailboxApiClient,
	type MailboxResult,
} from "../mailbox/mailbox-api.client";

const EVENTS_URL =
	"https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type GoogleEvent = {
	id?: string;
	iCalUID?: string;
	status?: string;
	summary?: string;
	description?: string;
	location?: string;
	hangoutLink?: string;
	htmlLink?: string;
	recurringEventId?: string;
	start?: GoogleEventTime;
	end?: GoogleEventTime;
	originalStartTime?: GoogleEventTime;
	organizer?: { email?: string; displayName?: string; self?: boolean };
	creator?: { email?: string; displayName?: string; self?: boolean };
	attendees?: {
		email?: string;
		displayName?: string;
		responseStatus?: string;
		organizer?: boolean;
		self?: boolean;
		resource?: boolean;
	}[];
	conferenceData?: {
		entryPoints?: { entryPointType?: string; uri?: string }[];
	};
};

export type GoogleEventTime = {
	dateTime?: string;
	date?: string;
	timeZone?: string;
};

export type EventsPage = {
	items?: GoogleEvent[];
	nextPageToken?: string;
	nextSyncToken?: string;
};

export type EventsQuery = {
	syncToken?: string;
	timeMin?: string;
	timeMax?: string;
	pageToken?: string;
	maxResults?: number;
};

@Injectable()
export class CalendarClient {
	constructor(private readonly api: MailboxApiClient) {}

	async listEvents(
		accessToken: string,
		query: EventsQuery,
	): Promise<MailboxResult<EventsPage>> {
		const window = query.syncToken
			? {}
			: { timeMin: query.timeMin, timeMax: query.timeMax };

		return this.api.get<EventsPage>(EVENTS_URL, accessToken, {
			singleEvents: true,
			showDeleted: true,
			maxResults: query.maxResults ?? 250,
			syncToken: query.syncToken,
			pageToken: query.pageToken,
			...window,
		});
	}
}

export function conferenceUrl(event: GoogleEvent): string | null {
	if (event.hangoutLink) return event.hangoutLink;

	const entry = event.conferenceData?.entryPoints?.find(
		(point) => point.entryPointType === "video" && point.uri,
	);

	return entry?.uri ?? null;
}

export function eventTime(
	time: GoogleEventTime | undefined,
): { at: Date; isAllDay: boolean } | null {
	if (time?.dateTime) {
		const at = new Date(time.dateTime);
		return Number.isNaN(at.getTime()) ? null : { at, isAllDay: false };
	}

	if (time?.date) {
		const at = new Date(`${time.date}T00:00:00Z`);
		return Number.isNaN(at.getTime()) ? null : { at, isAllDay: true };
	}

	return null;
}
