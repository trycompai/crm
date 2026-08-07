import { Injectable } from "@nestjs/common";
import {
	MailboxApiClient,
	type MailboxResult,
} from "../mailbox/mailbox-api.client";
import type { GmailPart } from "./gmail-mime";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailMessage = {
	id?: string;
	threadId?: string;
	labelIds?: string[];
	snippet?: string;
	internalDate?: string;
	historyId?: string;
	payload?: GmailPart;
};

export type MessageList = {
	messages?: { id?: string; threadId?: string }[];
	nextPageToken?: string;
	resultSizeEstimate?: number;
};

export type HistoryList = {
	history?: {
		id?: string;
		messagesAdded?: { message?: { id?: string; threadId?: string } }[];
	}[];
	nextPageToken?: string;
	historyId?: string;
};

export type Profile = {
	emailAddress?: string;
	historyId?: string;
};

export const WORK_MAIL_QUERY =
	"-in:chats -category:promotions -category:social -category:forums";

@Injectable()
export class GmailClient {
	constructor(private readonly api: MailboxApiClient) {}

	async profile(accessToken: string): Promise<MailboxResult<Profile>> {
		return this.api.get<Profile>(`${BASE}/profile`, accessToken);
	}

	async listMessages(
		accessToken: string,
		options: {
			after: Date;
			before: Date;
			pageToken?: string;
			maxResults?: number;
		},
	): Promise<MailboxResult<MessageList>> {
		const after = Math.floor(options.after.getTime() / 1000);
		const before = Math.ceil(options.before.getTime() / 1000);

		return this.api.get<MessageList>(`${BASE}/messages`, accessToken, {
			q: `${WORK_MAIL_QUERY} after:${after} before:${before}`,
			maxResults: options.maxResults ?? 100,
			pageToken: options.pageToken,
		});
	}

	async listHistory(
		accessToken: string,
		options: { startHistoryId: string; pageToken?: string },
	): Promise<MailboxResult<HistoryList>> {
		return this.api.get<HistoryList>(`${BASE}/history`, accessToken, {
			startHistoryId: options.startHistoryId,
			historyTypes: "messageAdded",
			maxResults: 500,
			pageToken: options.pageToken,
		});
	}

	async getMessage(
		accessToken: string,
		id: string,
	): Promise<MailboxResult<GmailMessage>> {
		return this.api.get<GmailMessage>(`${BASE}/messages/${id}`, accessToken, {
			format: "full",
		});
	}
}
