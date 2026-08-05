import {
	ActivityType,
	type Db,
	EmailDirection,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
	RecordSource,
} from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import { GmailClient, type GmailMessage } from "./gmail.client";
import type { GoogleResult } from "./google-api.client";
import { GoogleMatchService, type MatchContext } from "./google-match.service";
import { GoogleTokenService } from "./google-token.service";
import {
	type GmailHeader,
	header,
	normaliseMessageId,
	plainTextBody,
	rootMessageId,
	snippetOf,
	stripQuotedHistory,
} from "./mime";
import {
	type Participant,
	parseAddress,
	parseAddressList,
} from "./participants";
import { SyncStateService } from "./sync-state.service";

const MAX_MESSAGES_PER_TICK = 120;

export type GmailSyncOutcome = {
	source: "gmail";
	userId: string;
	status: "synced" | "skipped" | "reconnect" | "rate-limited" | "failed";
	messagesWritten?: number;
	threadsTouched?: number;
	reason?: string;
};

type ParsedMessage = {
	rfcMessageId: string;
	rootId: string;
	subject: string | null;
	from: Participant;
	recipients: { email: string; name: string | null; kind: "to" | "cc" }[];
	body: string;
	sentAt: Date;
	gmailMessageId: string | null;
};

@Injectable()
export class GmailSyncService {
	private readonly logger = new Logger(GmailSyncService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly gmail: GmailClient,
		private readonly tokens: GoogleTokenService,
		private readonly match: GoogleMatchService,
		private readonly state: SyncStateService,
		private readonly stamp: ActivityStampService,
	) {}

	async sync(row: MailboxSync): Promise<GmailSyncOutcome> {
		const token = await this.tokens.accessTokenFor(row.userId, "gmail");

		if (token.outcome === "not-connected") {
			return {
				source: "gmail",
				userId: row.userId,
				status: "skipped",
				reason: token.reason,
			};
		}

		if (token.outcome === "needs-reconnect") {
			await this.state.markNeedsReconnect(row.id, token.reason);
			return {
				source: "gmail",
				userId: row.userId,
				status: "reconnect",
				reason: token.reason,
			};
		}

		await this.state.markRunning(row.id);

		const profile = await this.gmail.profile(token.accessToken);
		if (profile.outcome !== "ok") {
			return this.handleFailure(row, profile, "gmail");
		}

		const mailbox = profile.data.emailAddress?.toLowerCase() ?? null;
		if (!mailbox) {
			await this.state.markFailed(row.id, "Gmail returned no mailbox address.");
			return {
				source: "gmail",
				userId: row.userId,
				status: "failed",
				reason: "No mailbox address.",
			};
		}

		if (!row.cursor) {
			return this.start(row, profile.data.historyId ?? null);
		}

		return this.incremental(row, token.accessToken, mailbox, row.cursor);
	}

	private async start(
		row: MailboxSync,
		historyId: string | null,
	): Promise<GmailSyncOutcome> {
		if (!historyId) {
			await this.state.markFailed(row.id, "Gmail returned no historyId.");
			return {
				source: "gmail",
				userId: row.userId,
				status: "failed",
				reason: "No historyId to start from.",
			};
		}

		await this.state.settle(row.id, {
			cursor: historyId,
			status: GoogleSyncStatus.RUNNING,
		});

		this.logger.log({
			message: "Gmail sync started — watching for new mail",
			userId: row.userId,
		});

		return { source: "gmail", userId: row.userId, status: "synced" };
	}

	private async incremental(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		startHistoryId: string,
	): Promise<GmailSyncOutcome> {
		const history = await this.gmail.listHistory(accessToken, {
			startHistoryId,
		});

		if (history.outcome === "cursor-invalid") {
			await this.state.clearCursor(row.id, history.reason);

			return {
				source: "gmail",
				userId: row.userId,
				status: "synced",
				reason: "History expired; resuming from now.",
			};
		}

		if (history.outcome !== "ok") {
			return this.handleFailure(row, history, "gmail");
		}

		const ids = new Set<string>();
		for (const entry of history.data.history ?? []) {
			for (const added of entry.messagesAdded ?? []) {
				if (added.message?.id) ids.add(added.message.id);
			}
		}

		const { written, remaining, deferred } = await this.ingest(
			row,
			accessToken,
			mailbox,
			[...ids],
		);

		await this.state.settle(row.id, {
			cursor:
				remaining > 0 || deferred > 0
					? startHistoryId
					: (history.data.historyId ?? startHistoryId),
			status: GoogleSyncStatus.RUNNING,
		});

		if (written > 0 || remaining > 0 || deferred > 0) {
			this.logger.log({
				message: "Gmail incremental sync",
				userId: row.userId,
				messagesWritten: written,
				remaining,
				deferred,
			});
		}

		return {
			source: "gmail",
			userId: row.userId,
			status: "synced",
			messagesWritten: written,
		};
	}

	private async ingest(
		row: MailboxSync,
		accessToken: string,
		mailbox: string,
		ids: readonly string[],
	): Promise<{ written: number; remaining: number; deferred: number }> {
		if (ids.length === 0) return { written: 0, remaining: 0, deferred: 0 };

		const alreadyHave = await this.db.emailMessage.findMany({
			where: { gmailMessageId: { in: [...ids] } },
			select: { gmailMessageId: true },
		});
		const seen = new Set(
			alreadyHave.map((existing) => existing.gmailMessageId),
		);

		const pending = ids.filter((id) => !seen.has(id));
		const batch = pending.slice(0, MAX_MESSAGES_PER_TICK);
		const remaining = pending.length - batch.length;

		if (batch.length === 0) return { written: 0, remaining, deferred: 0 };

		const [internal, suppressedDomains, suppressedEmails] = await Promise.all([
			this.match.internalIdentity(),
			this.match.suppressedDomains(),
			this.match.suppressedEmails(),
		]);

		const context = {
			ourAddresses: internal.addresses,
			ourDomains: internal.domains,
			suppressedDomains,
			suppressedEmails,
		};

		let written = 0;
		let deferred = 0;

		for (const id of batch) {
			const message = await this.gmail.getMessage(accessToken, id);
			if (message.outcome !== "ok") {
				if (isRetryable(message)) deferred += 1;
				continue;
			}

			const stored = await this.store(row, mailbox, message.data, context);
			if (stored) written += 1;
		}

		return { written, remaining, deferred };
	}

	private async store(
		row: MailboxSync,
		mailbox: string,
		message: GmailMessage,
		context: MatchContext,
	): Promise<boolean> {
		const parsed = this.parse(message);
		if (!parsed) return false;

		const existing = await this.db.emailMessage.findUnique({
			where: { rfcMessageId: parsed.rfcMessageId },
			select: { id: true },
		});
		if (existing) return false;

		const participants = [parsed.from, ...parsed.recipients];
		const outbound = parsed.from.email === mailbox;

		const thread = await this.db.emailThread.findUnique({
			where: { rootMessageId: parsed.rootId },
			select: { id: true, companyId: true, contactId: true },
		});

		let companyId = thread?.companyId ?? null;
		let contactId = thread?.contactId ?? null;

		if (!thread) {
			const repliedTo =
				outbound || (await this.hasOutboundInThread(parsed.rootId, mailbox));

			const match = await this.match.resolve(
				{
					participants,
					allowCreate: row.autoCreate && repliedTo,
					source: RecordSource.EMAIL,
					ownerId: row.userId,
				},
				context,
			);

			companyId = match.companyId;
			contactId = match.contactId;

			if (!companyId && !contactId) {
				return false;
			}
		}

		const record = await this.db.emailThread.upsert({
			where: { rootMessageId: parsed.rootId },
			create: {
				rootMessageId: parsed.rootId,
				subject: parsed.subject,
				companyId,
				contactId,
				firstMessageAt: parsed.sentAt,
				lastMessageAt: parsed.sentAt,
				messageCount: 0,
			},
			update: {},
			select: { id: true, firstMessageAt: true, lastMessageAt: true },
		});

		await this.db.emailMessage.create({
			data: {
				threadId: record.id,
				rfcMessageId: parsed.rfcMessageId,
				syncedByUserId: row.userId,
				gmailMessageId: parsed.gmailMessageId,
				direction: outbound ? EmailDirection.OUTBOUND : EmailDirection.INBOUND,
				fromEmail: parsed.from.email,
				fromName: parsed.from.name,
				recipients: parsed.recipients,
				subject: parsed.subject,
				snippet: snippetOf(parsed.body),
				body: parsed.body || null,
				sentAt: parsed.sentAt,
			},
		});

		const stats = await this.db.emailMessage.aggregate({
			where: { threadId: record.id },
			_count: { _all: true },
			_min: { sentAt: true },
			_max: { sentAt: true },
		});

		const firstMessageAt = stats._min.sentAt ?? parsed.sentAt;
		const lastMessageAt = stats._max.sentAt ?? parsed.sentAt;

		await this.db.emailThread.update({
			where: { id: record.id },
			data: {
				messageCount: stats._count._all,
				firstMessageAt,
				lastMessageAt,
				...(parsed.sentAt <= firstMessageAt ? { subject: parsed.subject } : {}),
			},
		});

		await this.project(record.id, row.userId, {
			subject: parsed.subject ?? "(no subject)",
			snippet: snippetOf(parsed.body),
			lastMessageAt,
			companyId,
			contactId,
		});

		return true;
	}

	private async hasOutboundInThread(
		rootMessageId: string,
		mailbox: string,
	): Promise<boolean> {
		const found = await this.db.emailMessage.findFirst({
			where: {
				thread: { rootMessageId },
				fromEmail: mailbox,
			},
			select: { id: true },
		});

		return found !== null;
	}

	private async project(
		emailThreadId: string,
		userId: string,
		summary: {
			subject: string;
			snippet: string | null;
			lastMessageAt: Date;
			companyId: string | null;
			contactId: string | null;
		},
	): Promise<void> {
		const activity = await this.db.activity.upsert({
			where: { emailThreadId },
			create: {
				type: ActivityType.EMAIL,
				subject: summary.subject,
				body: summary.snippet,
				occurredAt: summary.lastMessageAt,
				companyId: summary.companyId,
				contactId: summary.contactId,
				createdById: userId,
				emailThreadId,
				meta: { synced: true, source: "gmail" },
			},
			update: {
				body: summary.snippet,
				occurredAt: summary.lastMessageAt,
			},
			select: { createdAt: true },
		});

		await this.stamp.touch(
			{ companyId: summary.companyId, contactId: summary.contactId },
			activity.createdAt,
		);
	}

	private parse(message: GmailMessage): ParsedMessage | null {
		const headers = message.payload?.headers;

		const rawMessageId = header(headers, "message-id");
		if (!rawMessageId) return null;

		const from = parseAddress(header(headers, "from") ?? "");
		if (!from) return null;

		const sentAt = this.sentAt(message, headers);
		if (!sentAt) return null;

		const rootId = rootMessageId(headers) ?? normaliseMessageId(rawMessageId);

		const to = parseAddressList(header(headers, "to")).map((person) => ({
			email: person.email,
			name: person.name,
			kind: "to" as const,
		}));

		const cc = parseAddressList(header(headers, "cc")).map((person) => ({
			email: person.email,
			name: person.name,
			kind: "cc" as const,
		}));

		const body = stripQuotedHistory(plainTextBody(message.payload));

		return {
			rfcMessageId: normaliseMessageId(rawMessageId),
			rootId,
			subject: header(headers, "subject"),
			from,
			recipients: [...to, ...cc],
			body,
			sentAt,
			gmailMessageId: message.id ?? null,
		};
	}

	private sentAt(
		message: GmailMessage,
		headers: readonly GmailHeader[] | undefined,
	): Date | null {
		if (message.internalDate) {
			const at = new Date(Number(message.internalDate));
			if (!Number.isNaN(at.getTime())) return at;
		}

		const raw = header(headers, "date");
		if (!raw) return null;

		const at = new Date(raw);
		return Number.isNaN(at.getTime()) ? null : at;
	}

	private async handleFailure(
		row: MailboxSync,
		result: { outcome: string; reason: string; retryAfterMs?: number },
		source: "gmail",
	): Promise<GmailSyncOutcome> {
		if (result.outcome === "unauthorized") {
			await this.state.markNeedsReconnect(row.id, result.reason);
			return {
				source,
				userId: row.userId,
				status: "reconnect",
				reason: result.reason,
			};
		}

		if (result.outcome === "rate-limited") {
			await this.state.markRateLimited(row.id, result.retryAfterMs ?? 60_000);
			return {
				source,
				userId: row.userId,
				status: "rate-limited",
				reason: result.reason,
			};
		}

		await this.state.markFailed(row.id, result.reason);
		return {
			source,
			userId: row.userId,
			status: "failed",
			reason: result.reason,
		};
	}
}

function isRetryable(
	result: GoogleResult<unknown>,
): result is Extract<GoogleResult<unknown>, { outcome: "failed" }> {
	if (result.outcome === "failed") return result.retryable;
	return result.outcome === "rate-limited" || result.outcome === "unauthorized";
}
