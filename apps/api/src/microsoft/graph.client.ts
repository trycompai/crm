import { Injectable } from "@nestjs/common";
import {
	MailboxApiClient,
	type MailboxResult,
} from "../mailbox/mailbox-api.client";

const BASE = "https://graph.microsoft.com/v1.0/me";

const MESSAGE_FIELDS = [
	"id",
	"internetMessageId",
	"conversationId",
	"subject",
	"from",
	"sender",
	"toRecipients",
	"ccRecipients",
	"receivedDateTime",
	"sentDateTime",
	"body",
	"bodyPreview",
	"internetMessageHeaders",
	"parentFolderId",
	"webLink",
].join(",");

export type GraphAddress = {
	emailAddress?: { name?: string; address?: string };
};

export type GraphMessage = {
	id?: string;
	internetMessageId?: string;
	conversationId?: string;
	subject?: string | null;
	from?: GraphAddress;
	sender?: GraphAddress;
	toRecipients?: GraphAddress[];
	ccRecipients?: GraphAddress[];
	receivedDateTime?: string;
	sentDateTime?: string;
	body?: { contentType?: string; content?: string };
	bodyPreview?: string;
	internetMessageHeaders?: { name?: string; value?: string }[];
	parentFolderId?: string;
	webLink?: string;
};

export type MessagePage = {
	value?: GraphMessage[];
	"@odata.nextLink"?: string;
};

export type GraphUser = {
	mail?: string | null;
	userPrincipalName?: string | null;
};

export type GraphFolder = {
	id?: string;
};

@Injectable()
export class GraphClient {
	constructor(private readonly api: MailboxApiClient) {}

	async me(accessToken: string): Promise<MailboxResult<GraphUser>> {
		return this.api.get<GraphUser>(BASE, accessToken, {
			$select: "mail,userPrincipalName",
		});
	}

	async folder(
		accessToken: string,
		wellKnownName: string,
	): Promise<MailboxResult<GraphFolder>> {
		return this.api.get<GraphFolder>(
			`${BASE}/mailFolders/${wellKnownName}`,
			accessToken,
			{ $select: "id" },
		);
	}

	async listMessages(
		accessToken: string,
		options: { after: Date; top: number },
	): Promise<MailboxResult<MessagePage>> {
		return this.api.get<MessagePage>(`${BASE}/messages`, accessToken, {
			$select: MESSAGE_FIELDS,
			$filter: `receivedDateTime gt ${options.after.toISOString()} and isDraft eq false`,
			$orderby: "receivedDateTime asc",
			$top: options.top,
		});
	}

	async nextPage(
		accessToken: string,
		nextLink: string,
	): Promise<MailboxResult<MessagePage>> {
		return this.api.get<MessagePage>(nextLink, accessToken);
	}
}
