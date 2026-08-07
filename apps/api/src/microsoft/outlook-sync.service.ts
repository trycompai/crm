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
import { type Participant, parseAddress } from "../mailbox/participants";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	type IncomingMessage,
	ThreadWriterService,
} from "../mailbox/thread-writer.service";
import {
	type GraphAddress,
	GraphClient,
	type GraphFolder,
	type GraphMessage,
} from "./graph.client";

const MAX_MESSAGES_PER_TICK = 120;
const PAGE_SIZE = 50;

const OVERLAP_MS = 1_000;

const EXCLUDED_FOLDERS = ["junkemail", "deleteditems"] as const;

const CONVERSATION_ROOT_PREFIX = "outlook-conversation:";

type MailboxFailure<T> = Exclude<MailboxResult<T>, { outcome: "ok" }>;

type ExcludedFolders =
	| { outcome: "ok"; ids: Set<string> }
	| { outcome: "lookup-failed"; failure: MailboxFailure<GraphFolder> };

export type OutlookSyncOutcome = {
	source: "outlook";
	userId: string;
	status: "synced" | "skipped" | "reconnect" | "rate-limited" | "failed";
	messagesWritten?: number;
	reason?: string;
};

@Injectable()
export class OutlookSyncService {
	private readonly logger = new Logger(OutlookSyncService.name);

	constructor(
		private readonly graph: GraphClient,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly threads: ThreadWriterService,
	) {}

	async sync(row: MailboxSync): Promise<OutlookSyncOutcome> {
		const initializedAt = new Date();

		const token = await this.tokens.accessTokenFor(row.userId, "outlook");

		if (token.outcome === "not-connected") {
			return {
				source: "outlook",
				userId: row.userId,
				status: "skipped",
				reason: token.reason,
			};
		}

		if (token.outcome === "needs-reconnect") {
			await this.state.markNeedsReconnect(row.id, token.reason);
			return {
				source: "outlook",
				userId: row.userId,
				status: "reconnect",
				reason: token.reason,
			};
		}

		await this.state.markRunning(row.id);

		const me = await this.graph.me(token.accessToken);
		if (me.outcome !== "ok") {
			return this.handleFailure(row, me);
		}

		const mailbox = (
			me.data.mail ??
			me.data.userPrincipalName ??
			""
		).toLowerCase();

		if (!mailbox) {
			await this.state.markFailed(
				row.id,
				"Microsoft returned no mailbox address.",
			);
			return {
				source: "outlook",
				userId: row.userId,
				status: "failed",
				reason: "No mailbox address.",
			};
		}

		if (!row.cursor) {
			return this.start(row, initializedAt);
		}

		return this.incremental(row, token.accessToken, mailbox, row.cursor);
	}

	private async start(
		row: MailboxSync,
		initializedAt: Date,
	): Promise<OutlookSyncOutcome> {
		await this.state.settle(row.id, {
			cursor: initializedAt.toISOString(),
			status: GoogleSyncStatus.RUNNING,
		});

		this.logger.log({
			message: "Outlook sync started — watching for new mail",
			userId: row.userId,
		});

		return { source: "outlook", userId: row.userId, status: "synced" };
	}

	private async incremental(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		cursor: string,
	): Promise<OutlookSyncOutcome> {
		const from = new Date(cursor);
		if (Number.isNaN(from.getTime())) {
			await this.state.clearCursor(row.id, "The stored cursor was not a date.");
			return {
				source: "outlook",
				userId: row.userId,
				status: "synced",
				reason: "Cursor reset; resuming from now.",
			};
		}

		const folders = await this.excludedFolderIds(accessToken);
		if (folders.outcome !== "ok") {
			return this.handleFailure(row, folders.failure);
		}

		const excluded = folders.ids;

		let page = await this.graph.listMessages(accessToken, {
			after: new Date(from.getTime() - OVERLAP_MS),
			top: PAGE_SIZE,
		});

		let context: MatchContext | null = null;
		let written = 0;
		let seen = 0;
		let furthest = from;

		while (page.outcome === "ok") {
			const remaining = MAX_MESSAGES_PER_TICK - seen;
			const messages = (page.data.value ?? []).slice(0, Math.max(remaining, 0));

			for (const message of messages) {
				seen += 1;

				const receivedAt = message.receivedDateTime
					? new Date(message.receivedDateTime)
					: null;
				if (receivedAt && !Number.isNaN(receivedAt.getTime())) {
					if (receivedAt > furthest) furthest = receivedAt;
				}

				if (message.parentFolderId && excluded.has(message.parentFolderId)) {
					continue;
				}

				const parsed = this.parse(message);
				if (!parsed) continue;

				context ??= await this.threads.context();

				const stored = await this.threads.store(
					row,
					{ mailbox, origin: "outlook" },
					parsed,
					context,
				);
				if (stored) written += 1;
			}

			const nextLink = page.data["@odata.nextLink"];
			if (!nextLink || seen >= MAX_MESSAGES_PER_TICK) break;

			page = await this.graph.nextPage(accessToken, nextLink);
		}

		if (page.outcome !== "ok") {
			return this.handleFailure(row, page);
		}

		await this.state.settle(row.id, {
			cursor: furthest.toISOString(),
			status: GoogleSyncStatus.RUNNING,
		});

		if (written > 0) {
			this.logger.log({
				message: "Outlook incremental sync",
				userId: row.userId,
				messagesWritten: written,
				messagesSeen: seen,
			});
		}

		return {
			source: "outlook",
			userId: row.userId,
			status: "synced",
			messagesWritten: written,
		};
	}

	private async excludedFolderIds(
		accessToken: string,
	): Promise<ExcludedFolders> {
		const ids = new Set<string>();

		for (const name of EXCLUDED_FOLDERS) {
			const folder = await this.graph.folder(accessToken, name);

			if (folder.outcome === "ok") {
				if (folder.data.id) ids.add(folder.data.id);
				continue;
			}

			if (isMissingFolder(folder)) continue;

			return { outcome: "lookup-failed", failure: folder };
		}

		return { outcome: "ok", ids };
	}

	private parse(message: GraphMessage): IncomingMessage | null {
		const internetMessageId = message.internetMessageId?.trim();
		if (!internetMessageId) return null;

		const from = addressOf(message.from ?? message.sender);
		if (!from) return null;

		const sentAt = this.sentAt(message);
		if (!sentAt) return null;

		const rootId = this.rootIdOf(message, internetMessageId);

		const to = addressList(message.toRecipients, "to");
		const cc = addressList(message.ccRecipients, "cc");

		const raw = message.body?.content ?? message.bodyPreview ?? "";
		const text =
			message.body?.contentType?.toLowerCase() === "html"
				? stripHtml(raw)
				: raw;

		return {
			rfcMessageId: normaliseMessageId(internetMessageId),
			rootId,
			subject: message.subject?.trim() || null,
			from,
			recipients: [...to, ...cc],
			body: stripQuotedHistory(text),
			sentAt,
			outlookMessageId: message.id ?? null,
			outlookWebLink: message.webLink ?? null,
		};
	}

	private rootIdOf(message: GraphMessage, internetMessageId: string): string {
		const headers = message.internetMessageHeaders ?? [];

		const value = (name: string): string | null => {
			const wanted = name.toLowerCase();
			const found = headers.find(
				(entry) => entry.name?.toLowerCase() === wanted,
			);
			return found?.value?.trim() || null;
		};

		const references = value("references");
		const inReplyTo = value("in-reply-to");

		if (references || inReplyTo) {
			const root = rootMessageIdFrom({
				references,
				inReplyTo,
				messageId: internetMessageId,
			});

			if (root) return root;
		}

		if (message.conversationId) {
			return `${CONVERSATION_ROOT_PREFIX}${message.conversationId}`;
		}

		return normaliseMessageId(internetMessageId);
	}

	private sentAt(message: GraphMessage): Date | null {
		for (const raw of [message.sentDateTime, message.receivedDateTime]) {
			if (!raw) continue;
			const at = new Date(raw);
			if (!Number.isNaN(at.getTime())) return at;
		}

		return null;
	}

	private async handleFailure(
		row: MailboxSync,
		result: { outcome: string; reason: string; retryAfterMs?: number },
	): Promise<OutlookSyncOutcome> {
		if (result.outcome === "unauthorized") {
			await this.state.markNeedsReconnect(row.id, result.reason);
			return {
				source: "outlook",
				userId: row.userId,
				status: "reconnect",
				reason: result.reason,
			};
		}

		if (result.outcome === "rate-limited") {
			await this.state.markRateLimited(row.id, result.retryAfterMs ?? 60_000);
			return {
				source: "outlook",
				userId: row.userId,
				status: "rate-limited",
				reason: result.reason,
			};
		}

		await this.state.markFailed(row.id, result.reason);
		return {
			source: "outlook",
			userId: row.userId,
			status: "failed",
			reason: result.reason,
		};
	}
}

function isMissingFolder(failure: MailboxFailure<GraphFolder>): boolean {
	return failure.outcome === "cursor-invalid";
}

function addressOf(entry: GraphAddress | undefined): Participant | null {
	const address = entry?.emailAddress?.address?.trim();
	if (!address) return null;

	const name = entry?.emailAddress?.name?.trim();

	return parseAddress(name ? `${name} <${address}>` : address) ?? null;
}

function addressList(
	entries: GraphAddress[] | undefined,
	kind: "to" | "cc",
): { email: string; name: string | null; kind: "to" | "cc" }[] {
	const seen = new Set<string>();
	const people: { email: string; name: string | null; kind: "to" | "cc" }[] =
		[];

	for (const entry of entries ?? []) {
		const person = addressOf(entry);
		if (!person || seen.has(person.email)) continue;

		seen.add(person.email);
		people.push({ email: person.email, name: person.name, kind });
	}

	return people;
}
