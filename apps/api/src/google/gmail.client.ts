import { Injectable } from "@nestjs/common";
import { GoogleApiClient, type GoogleResult } from "./google-api.client";
import type { GmailPart } from "./mime";

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
	constructor(private readonly api: GoogleApiClient) {}

	async profile(accessToken: string): Promise<GoogleResult<Profile>> {
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
	): Promise<GoogleResult<MessageList>> {
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
	): Promise<GoogleResult<HistoryList>> {
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
	): Promise<GoogleResult<GmailMessage>> {
		return this.api.get<GmailMessage>(`${BASE}/messages/${id}`, accessToken, {
			format: "full",
		});
	}

	async sendMessage(
		accessToken: string,
		input: {
			to: string;
			subject: string;
			body: string;
			threadId?: string | null;
			inReplyTo?: string | null;
		},
	): Promise<GoogleResult<GmailMessage>> {
		const raw = encodeMime(input);
		return this.api.post<GmailMessage>(`${BASE}/messages/send`, accessToken, {
			raw,
			...(input.threadId ? { threadId: input.threadId } : {}),
		});
	}
}

function encodeMime(input: {
	to: string;
	subject: string;
	body: string;
	inReplyTo?: string | null;
}): string {
	if (/\r|\n/.test(input.to) || /\r|\n/.test(input.subject)) {
		throw new Error("Email headers cannot contain line breaks.");
	}
	const subject = `=?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`;
	const body =
		Buffer.from(input.body, "utf8")
			.toString("base64")
			.match(/.{1,76}/g)
			?.join("\r\n") ?? "";
	const mime = [
		`To: ${input.to}`,
		`Subject: ${subject}`,
		...(input.inReplyTo
			? [`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`]
			: []),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
		"",
		body,
	].join("\r\n");
	return Buffer.from(mime).toString("base64url");
}
