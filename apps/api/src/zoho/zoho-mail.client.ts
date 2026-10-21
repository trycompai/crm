import type { ZohoEndpoints } from "@crm/auth";
import { schemas } from "@crm/validation";
import { Inject, Injectable } from "@nestjs/common";
import type { ZodType } from "zod";
import {
	MailboxApiClient,
	type MailboxResult,
} from "../mailbox/mailbox-api.client";
import {
	ZOHO_AUTH_SCHEME,
	ZOHO_ENDPOINTS,
	ZOHO_PAGE_SIZE,
} from "./zoho.constants";

export type ZohoAccount = ReturnType<typeof schemas.zoho.account.parse>;
export type ZohoFolder = ReturnType<typeof schemas.zoho.folder.parse>;
export type ZohoMessageSummary = ReturnType<
	typeof schemas.zoho.messageSummary.parse
>;

export type ZohoMessageBody = {
	/** HTML, as Zoho stores it. The caller strips it. */
	content: string;
};

export type ZohoHeaders = {
	/** Header names lower-cased, so lookups do not have to guess the casing. */
	values: Map<string, string[]>;
};

/**
 * Zoho Mail's REST API, shaped like the Graph client next door.
 *
 * Three things about it drive the design here and are worth stating once:
 *
 * 1. Everything is keyed on a numeric `accountId` that only `/api/accounts`
 *    knows, so a sync always starts with an account lookup.
 * 2. There is no "changed since" filter. The list endpoint pages with
 *    `start`/`limit` over a date-sorted list, so an incremental sync reads
 *    newest-first and stops when it reaches mail it has already seen.
 * 3. The list gives no RFC `Message-ID`, `References` or `In-Reply-To`. Those
 *    come from a per-message header call, which is what lets a Zoho-synced
 *    message de-duplicate against the same mail seen through Gmail.
 */
@Injectable()
export class ZohoMailClient {
	constructor(
		private readonly api: MailboxApiClient,
		@Inject(ZOHO_ENDPOINTS)
		private readonly endpoints: ZohoEndpoints | null,
	) {}

	private base(): string {
		if (!this.endpoints) {
			throw new Error(
				"Zoho is not configured: set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.",
			);
		}

		return this.endpoints.mailApiBase;
	}

	/**
	 * A deep link into Zoho's web client for one message. Zoho has no
	 * `webLink` field of its own, so this is assembled from the ids we hold.
	 */
	messageUrl(folderId: string, messageId: string): string | null {
		if (!this.endpoints) return null;

		return `${this.endpoints.mailWebBase}/zm/#mail/folder/${folderId}/p/${messageId}`;
	}

	async accounts(accessToken: string): Promise<MailboxResult<ZohoAccount[]>> {
		return this.get("/accounts", accessToken, schemas.zoho.accounts);
	}

	async folders(
		accessToken: string,
		accountId: string,
	): Promise<MailboxResult<ZohoFolder[]>> {
		return this.get(
			`/accounts/${encodeURIComponent(accountId)}/folders`,
			accessToken,
			schemas.zoho.folders,
		);
	}

	/**
	 * One page of the mailbox, newest first.
	 *
	 * `start` is 1-based and counts messages, not pages. `includesent` pulls in
	 * the user's own replies, which is how an outbound message gets filed
	 * against a company at all.
	 */
	async listMessages(
		accessToken: string,
		accountId: string,
		options: { start: number; limit?: number },
	): Promise<MailboxResult<ZohoMessageSummary[]>> {
		return this.get(
			`/accounts/${encodeURIComponent(accountId)}/messages/view`,
			accessToken,
			schemas.zoho.messageList,
			{
				start: options.start,
				limit: options.limit ?? ZOHO_PAGE_SIZE,
				sortBy: "date",
				sortorder: false,
				includeto: true,
				includesent: true,
			},
		);
	}

	async messageHeaders(
		accessToken: string,
		accountId: string,
		folderId: string,
		messageId: string,
	): Promise<MailboxResult<ZohoHeaders>> {
		const result = await this.get(
			`${this.messagePath(accountId, folderId, messageId)}/header`,
			accessToken,
			schemas.zoho.messageHeaders,
			{ raw: false },
		);
		if (result.outcome !== "ok") return result;

		const values = new Map<string, string[]>();
		for (const [name, entries] of Object.entries(result.data.headerContent)) {
			values.set(name.toLowerCase(), entries);
		}

		return { outcome: "ok", data: { values } };
	}

	async messageContent(
		accessToken: string,
		accountId: string,
		folderId: string,
		messageId: string,
	): Promise<MailboxResult<ZohoMessageBody>> {
		const result = await this.get(
			`${this.messagePath(accountId, folderId, messageId)}/content`,
			accessToken,
			schemas.zoho.messageContent,
		);
		if (result.outcome !== "ok") return result;

		return { outcome: "ok", data: { content: result.data.content ?? "" } };
	}

	private messagePath(
		accountId: string,
		folderId: string,
		messageId: string,
	): string {
		return [
			"/accounts",
			encodeURIComponent(accountId),
			"folders",
			encodeURIComponent(folderId),
			"messages",
			encodeURIComponent(messageId),
		].join("/");
	}

	/**
	 * Zoho wraps every reply in `{ status, data }` and does not always let the
	 * HTTP status disagree with `status.code`. Unwrap here so callers only ever
	 * see the payload — or a `MailboxResult` failure that reads the same as
	 * Google's and Microsoft's.
	 */
	private async get<T>(
		path: string,
		accessToken: string,
		schema: ZodType<T>,
		params: Record<string, string | number | boolean | undefined> = {},
	): Promise<MailboxResult<T>> {
		const result = await this.api.get<unknown>(
			`${this.base()}${path}`,
			accessToken,
			params,
			{ scheme: ZOHO_AUTH_SCHEME },
		);

		if (result.outcome !== "ok") return result;

		const envelope = schemas.zoho.envelope.safeParse(result.data);
		if (!envelope.success) {
			return {
				outcome: "failed",
				reason: `Zoho returned a response this client does not recognise (${path}).`,
				retryable: false,
			};
		}

		const { status, data } = envelope.data;

		if (status.code >= 200 && status.code < 300) {
			const payload = schema.safeParse(data);
			if (payload.success) return { outcome: "ok", data: payload.data };

			return {
				outcome: "failed",
				reason: `Zoho sent a shape this client cannot read (${path}): ${payload.error.message}`,
				retryable: false,
			};
		}

		const reason = status.description ?? `Zoho status ${status.code}`;

		if (status.code === 401) return { outcome: "unauthorized", reason };
		if (status.code === 404) return { outcome: "cursor-invalid", reason };
		if (status.code === 429) {
			return { outcome: "rate-limited", reason, retryAfterMs: 60_000 };
		}

		return { outcome: "failed", reason, retryable: status.code >= 500 };
	}
}
