import {
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import type { MailboxResult } from "../mailbox/mailbox-api.client";
import type { MatchContext } from "../mailbox/mailbox-match.service";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import {
	normaliseMessageId,
	rootMessageIdFrom,
	stripHtml,
	stripQuotedHistory,
} from "../mailbox/message-text";
import { parseAddress, parseAddressList } from "../mailbox/participants";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../mailbox/thread-writer.service";
import {
	ZOHO_EXCLUDED_FOLDER_TYPES,
	ZOHO_MAX_MESSAGES_PER_TICK,
	ZOHO_PAGE_SIZE,
	ZOHO_THREAD_ROOT_PREFIX,
} from "./zoho.constants";
import {
	type ZohoAccount,
	type ZohoHeaders,
	ZohoMailClient,
	type ZohoMessageSummary,
} from "./zoho-mail.client";

// The list is sorted by date, so re-reading a second of overlap costs one or
// two duplicate lookups and closes the window where two messages share a
// timestamp and the later one is dropped.
const OVERLAP_MS = 1_000;

export type ZohoSyncOutcome = {
	source: "zohomail";
	userId: string;
	status: "synced" | "skipped" | "reconnect" | "rate-limited" | "failed";
	messagesWritten?: number;
	reason?: string;
};

type Failure = Exclude<MailboxResult<unknown>, { outcome: "ok" }>;

type Mailbox = {
	accountId: string;
	address: string;
};

@Injectable()
export class ZohoMailSyncService {
	private readonly logger = new Logger(ZohoMailSyncService.name);

	constructor(
		private readonly zoho: ZohoMailClient,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly threads: ThreadWriterService,
	) {}

	async sync(row: MailboxSync): Promise<ZohoSyncOutcome> {
		const initializedAt = new Date();

		const token = await this.tokens.accessTokenFor(row.userId, "zohomail");

		if (token.outcome === "not-connected") {
			return this.outcome(row, "skipped", token.reason);
		}

		if (token.outcome === "needs-reconnect") {
			await this.state.markNeedsReconnect(row.id, token.reason);
			return this.outcome(row, "reconnect", token.reason);
		}

		await this.state.markRunning(row.id);

		const mailbox = await this.mailbox(token.accessToken);
		if (mailbox.outcome !== "ok") return this.handleFailure(row, mailbox);

		// First run: remember where "now" is and sync forward from here. Back-
		// filling a whole mailbox is a different, much heavier job than keeping
		// up with it, and doing it silently on connect is a nasty surprise.
		if (!row.cursor) {
			await this.state.settle(row.id, {
				cursor: initializedAt.getTime().toString(),
				status: GoogleSyncStatus.RUNNING,
			});

			this.logger.log({
				message: "Zoho Mail sync started — watching for new mail",
				userId: row.userId,
				mailbox: mailbox.data.address,
			});

			return this.outcome(row, "synced");
		}

		return this.incremental(row, token.accessToken, mailbox.data, row.cursor);
	}

	private async incremental(
		row: MailboxSync,
		accessToken: string,
		mailbox: Mailbox,
		cursor: string,
	): Promise<ZohoSyncOutcome> {
		const since = Number(cursor);
		if (!Number.isFinite(since)) {
			await this.state.clearCursor(
				row.id,
				"The stored cursor was not a timestamp.",
			);
			return this.outcome(row, "synced", "Cursor reset; resuming from now.");
		}

		const excluded = await this.excludedFolderIds(
			accessToken,
			mailbox.accountId,
		);
		if (excluded.outcome !== "ok") return this.handleFailure(row, excluded);

		const floor = since - OVERLAP_MS;

		let context: MatchContext | null = null;
		let start = 1;
		let seen = 0;
		let written = 0;
		let furthest = since;
		let exhausted = false;

		// Zoho has no "modified since" filter, so this walks the date-sorted list
		// newest-first and stops at the first message the last tick already saw.
		while (seen < ZOHO_MAX_MESSAGES_PER_TICK && !exhausted) {
			const page = await this.zoho.listMessages(
				accessToken,
				mailbox.accountId,
				{
					start,
					limit: ZOHO_PAGE_SIZE,
				},
			);
			if (page.outcome !== "ok") return this.handleFailure(row, page);

			if (page.data.length === 0) break;

			for (const summary of page.data) {
				const receivedAt = summary.receivedTime ?? summary.sentDateInGMT;

				if (receivedAt !== undefined && receivedAt <= floor) {
					exhausted = true;
					break;
				}

				seen += 1;
				if (seen > ZOHO_MAX_MESSAGES_PER_TICK) {
					exhausted = true;
					break;
				}

				if (receivedAt !== undefined && receivedAt > furthest) {
					furthest = receivedAt;
				}

				if (excluded.data.has(summary.folderId)) continue;

				const parsed = await this.parse(
					accessToken,
					mailbox.accountId,
					summary,
				);
				if (parsed.outcome === "skip") continue;
				if (parsed.outcome !== "ok") return this.handleFailure(row, parsed);

				context ??= await this.threads.context();

				const stored = await this.threads.store(
					row,
					{ mailbox: mailbox.address, origin: "zohomail" },
					parsed.data,
					context,
				);
				if (stored) written += 1;
			}

			if (page.data.length < ZOHO_PAGE_SIZE) break;

			start += page.data.length;
		}

		await this.state.settle(row.id, {
			cursor: furthest.toString(),
			status: GoogleSyncStatus.RUNNING,
		});

		if (written > 0) {
			this.logger.log({
				message: "Zoho Mail incremental sync",
				userId: row.userId,
				messagesWritten: written,
				messagesSeen: seen,
			});
		}

		return this.outcome(row, "synced", undefined, written);
	}

	/**
	 * Zoho keys every call on a numeric account id, and one login can carry
	 * several: the real mailbox plus any POP/IMAP mailbox the user has attached.
	 * Only a `ZOHO_ACCOUNT` can be read through this API.
	 */
	private async mailbox(accessToken: string): Promise<MailboxResult<Mailbox>> {
		const accounts = await this.zoho.accounts(accessToken);
		if (accounts.outcome !== "ok") return accounts;

		const usable = accounts.data.find(
			(account) => account.type !== "IMAP_ACCOUNT" && account.enabled !== false,
		);

		const address = addressOf(usable);

		if (!usable || !address) {
			return {
				outcome: "failed",
				reason: "Zoho returned no readable mailbox for this account.",
				retryable: false,
			};
		}

		return {
			outcome: "ok",
			data: { accountId: usable.accountId, address },
		};
	}

	private async excludedFolderIds(
		accessToken: string,
		accountId: string,
	): Promise<MailboxResult<Set<string>>> {
		const folders = await this.zoho.folders(accessToken, accountId);
		if (folders.outcome !== "ok") return folders;

		const excluded = new Set<string>();

		for (const folder of folders.data) {
			const type = folder.folderType;
			if (!type) continue;

			if ((ZOHO_EXCLUDED_FOLDER_TYPES as readonly string[]).includes(type)) {
				excluded.add(folder.folderId);
			}
		}

		return { outcome: "ok", data: excluded };
	}

	/**
	 * Turn one list entry into a storable message.
	 *
	 * The list alone is not enough: it has no RFC `Message-ID`, so a mail seen
	 * through both Gmail and Zoho would be stored twice. The header call is what
	 * makes the `rfcMessageId` unique constraint do its job across providers.
	 */
	private async parse(
		accessToken: string,
		accountId: string,
		summary: ZohoMessageSummary,
	): Promise<
		{ outcome: "ok"; data: IncomingMessage } | { outcome: "skip" } | Failure
	> {
		const from = senderOf(summary);
		if (!from) return { outcome: "skip" };

		const sentAtMillis = summary.sentDateInGMT ?? summary.receivedTime;
		if (sentAtMillis === undefined) return { outcome: "skip" };

		const headers = await this.zoho.messageHeaders(
			accessToken,
			accountId,
			summary.folderId,
			summary.messageId,
		);
		if (headers.outcome !== "ok") {
			// A message that vanished between the list and the fetch is normal —
			// the user moved or deleted it. Skip rather than fail the whole tick.
			if (headers.outcome === "cursor-invalid") return { outcome: "skip" };
			return headers;
		}

		const rfcMessageId = firstHeader(headers.data, "message-id");
		if (!rfcMessageId) return { outcome: "skip" };

		const content = await this.zoho.messageContent(
			accessToken,
			accountId,
			summary.folderId,
			summary.messageId,
		);
		if (content.outcome !== "ok") {
			if (content.outcome === "cursor-invalid") return { outcome: "skip" };
			return content;
		}

		const recipients = [
			...named(parseAddressList(summary.toAddress), "to"),
			...named(parseAddressList(summary.ccAddress), "cc"),
		];

		return {
			outcome: "ok",
			data: {
				rfcMessageId: normaliseMessageId(rfcMessageId),
				rootId: this.rootIdOf(headers.data, rfcMessageId, summary),
				subject: summary.subject?.trim() || null,
				from,
				recipients,
				body: stripQuotedHistory(stripHtml(content.data.content)),
				sentAt: new Date(sentAtMillis),
				zohoMessageId: summary.messageId,
				zohoWebLink: this.zoho.messageUrl(summary.folderId, summary.messageId),
			},
		};
	}

	private rootIdOf(
		headers: ZohoHeaders,
		rfcMessageId: string,
		summary: ZohoMessageSummary,
	): string {
		const references = firstHeader(headers, "references");
		const inReplyTo = firstHeader(headers, "in-reply-to");

		if (references || inReplyTo) {
			const root = rootMessageIdFrom({
				references,
				inReplyTo,
				messageId: rfcMessageId,
			});

			if (root) return root;
		}

		// Zoho's own conversation id is the fallback, not the first choice: it
		// only groups mail this mailbox has seen, where References spans
		// providers.
		if (summary.threadId) {
			return `${ZOHO_THREAD_ROOT_PREFIX}${summary.threadId}`;
		}

		return normaliseMessageId(rfcMessageId);
	}

	private async handleFailure(
		row: MailboxSync,
		result: { outcome: string; reason: string; retryAfterMs?: number },
	): Promise<ZohoSyncOutcome> {
		if (result.outcome === "unauthorized") {
			await this.state.markNeedsReconnect(row.id, result.reason);
			return this.outcome(row, "reconnect", result.reason);
		}

		if (result.outcome === "rate-limited") {
			await this.state.markRateLimited(row.id, result.retryAfterMs ?? 60_000);
			return this.outcome(row, "rate-limited", result.reason);
		}

		await this.state.markFailed(row.id, result.reason);
		return this.outcome(row, "failed", result.reason);
	}

	private outcome(
		row: MailboxSync,
		status: ZohoSyncOutcome["status"],
		reason?: string,
		messagesWritten?: number,
	): ZohoSyncOutcome {
		const outcome: ZohoSyncOutcome = {
			source: "zohomail",
			userId: row.userId,
			status,
		};

		if (reason !== undefined) outcome.reason = reason;
		if (messagesWritten !== undefined) {
			outcome.messagesWritten = messagesWritten;
		}

		return outcome;
	}
}

function addressOf(account: ZohoAccount | undefined): string | null {
	const address = (
		account?.mailboxAddress ??
		account?.primaryEmailAddress ??
		""
	)
		.trim()
		.toLowerCase();

	return address || null;
}

/**
 * `fromAddress` is a bare address and `sender` is the display name, so the two
 * have to be recombined before the shared address parser sees them.
 */
function senderOf(summary: ZohoMessageSummary) {
	const email = summary.fromAddress?.trim();
	if (!email) return null;

	const name = summary.sender?.trim();

	return parseAddress(name ? `"${name}" <${email}>` : email);
}

function named(
	participants: { email: string; name: string | null }[],
	kind: "to" | "cc",
) {
	return participants.map((participant) => ({ ...participant, kind }));
}

function firstHeader(headers: ZohoHeaders, name: string): string | null {
	const value = headers.values.get(name)?.at(0)?.trim();
	return value || null;
}
