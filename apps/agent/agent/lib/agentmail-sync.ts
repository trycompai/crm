import {
	ActivityType,
	type Db,
	db,
	EmailDirection,
	EmailEventType,
	EmailProvider,
	type Prisma,
} from "@crm/db";
import { z } from "zod";

const DEFAULT_API_URL = "https://api.agentmail.to";
const PAGE_SIZE = 100;
const MAX_MESSAGES_PER_SYNC = 500;
const OVERLAP_MS = 5 * 60_000;

const messageSchema = z
	.object({
		inbox_id: z.string().min(1),
		thread_id: z.string().min(1),
		message_id: z.string().min(1),
		labels: z.array(z.string()),
		timestamp: z.string().datetime({ offset: true }),
		from: z.string().min(1),
		to: z.array(z.string()),
		cc: z.array(z.string()).optional(),
		bcc: z.array(z.string()).optional(),
		subject: z.string().nullable().optional(),
		preview: z.string().nullable().optional(),
		text: z.string().nullable().optional(),
		html: z.string().nullable().optional(),
		extracted_text: z.string().nullable().optional(),
		extracted_html: z.string().nullable().optional(),
		in_reply_to: z.string().nullable().optional(),
		references: z.array(z.string()).optional(),
	})
	.passthrough();

const listSchema = z.object({
	count: z.number().int().nonnegative(),
	messages: z.array(messageSchema),
	next_page_token: z.string().nullable().optional(),
});

export type AgentMailMessage = z.infer<typeof messageSchema>;

export type AgentMailSyncOutcome = {
	status: "synced" | "skipped";
	written: number;
	duplicates: number;
	ignored: number;
	reason?: string;
};

type Match = { companyId: string | null; contactId: string | null };

export async function runAgentMailSync(
	database: Db = db,
	request: typeof fetch = fetch,
): Promise<AgentMailSyncOutcome> {
	const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
	const inboxId = process.env.AGENTMAIL_INBOX_ID?.trim();
	if (!apiKey || !inboxId) {
		return {
			status: "skipped",
			written: 0,
			duplicates: 0,
			ignored: 0,
			reason: "AgentMail inbound access is not configured.",
		};
	}

	const apiUrl = process.env.AGENTMAIL_API_URL?.trim() ?? DEFAULT_API_URL;
	const configuredEmail =
		process.env.AGENTMAIL_INBOX_EMAIL?.trim().toLowerCase();
	const inboxEmail = configuredEmail || inboxId;
	const inbox = await database.emailInbox.upsert({
		where: {
			provider_externalInboxId: {
				provider: EmailProvider.AGENTMAIL,
				externalInboxId: inboxId,
			},
		},
		create: {
			provider: EmailProvider.AGENTMAIL,
			externalInboxId: inboxId,
			email: inboxEmail,
			isDefault: true,
			isEnabled: true,
		},
		update: { email: inboxEmail },
		select: { id: true, lastSyncedAt: true },
	});

	const after = inbox.lastSyncedAt
		? new Date(inbox.lastSyncedAt.getTime() - OVERLAP_MS)
		: null;
	let pageToken: string | null = null;
	let written = 0;
	let duplicates = 0;
	let ignored = 0;
	let scanned = 0;
	let checkpoint: Date | null = null;
	let capped = false;

	try {
		for (;;) {
			const page = await listMessages({
				apiUrl,
				apiKey,
				inboxId,
				after,
				pageToken,
				request,
			});

			for (const summary of page.messages) {
				if (scanned >= MAX_MESSAGES_PER_SYNC) {
					capped = true;
					break;
				}
				scanned += 1;
				checkpoint = maxDate(checkpoint, new Date(summary.timestamp));

				if (
					!summary.labels.some((label) => label.toLowerCase() === "received")
				) {
					ignored += 1;
					continue;
				}

				const existing = await database.emailMessage.findUnique({
					where: {
						provider_externalMessageId: {
							provider: EmailProvider.AGENTMAIL,
							externalMessageId: summary.message_id,
						},
					},
					select: { id: true },
				});
				if (existing) {
					duplicates += 1;
					continue;
				}

				const sender = parseAddress(summary.from);
				const match = sender
					? await matchSender(sender.email, database)
					: { companyId: null, contactId: null };

				const message = await getMessage({
					apiUrl,
					apiKey,
					inboxId,
					messageId: summary.message_id,
					request,
				});
				if (message.inbox_id !== inboxId) {
					throw new Error(
						"AgentMail returned a message from a different inbox.",
					);
				}
				const created = await importAgentMailMessage(
					message,
					match,
					inbox.id,
					database,
				);
				if (created) written += 1;
				else duplicates += 1;
			}

			if (scanned >= MAX_MESSAGES_PER_SYNC || !page.next_page_token) {
				capped =
					scanned >= MAX_MESSAGES_PER_SYNC && Boolean(page.next_page_token);
				break;
			}
			pageToken = page.next_page_token;
		}

		await database.emailInbox.update({
			where: { id: inbox.id },
			data: {
				lastSyncedAt: capped && checkpoint ? checkpoint : new Date(),
				lastError: null,
			},
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		await database.emailInbox.update({
			where: { id: inbox.id },
			data: { lastError: reason.slice(0, 500) },
		});
		throw error;
	}

	return { status: "synced", written, duplicates, ignored };
}

export async function importAgentMailMessage(
	input: AgentMailMessage,
	match: Match,
	inboxId: string,
	database: Db = db,
): Promise<boolean> {
	const message = messageSchema.parse(input);
	const sender = parseAddress(message.from);
	if (!sender) return false;

	return database.$transaction(async (tx) => {
		const existing = await tx.emailMessage.findUnique({
			where: {
				provider_externalMessageId: {
					provider: EmailProvider.AGENTMAIL,
					externalMessageId: message.message_id,
				},
			},
			select: { id: true },
		});
		if (existing) return false;

		const sentAt = new Date(message.timestamp);
		const thread = await tx.emailThread.upsert({
			where: {
				provider_externalThreadId: {
					provider: EmailProvider.AGENTMAIL,
					externalThreadId: message.thread_id,
				},
			},
			create: {
				rootMessageId: `agentmail:${message.thread_id}`,
				subject: clean(message.subject),
				provider: EmailProvider.AGENTMAIL,
				externalThreadId: message.thread_id,
				companyId: match.companyId,
				contactId: match.contactId,
				firstMessageAt: sentAt,
				lastMessageAt: sentAt,
			},
			update: {
				companyId: match.companyId ?? undefined,
				contactId: match.contactId ?? undefined,
				subject: clean(message.subject) ?? undefined,
			},
			select: { id: true },
		});

		const record = await tx.emailMessage.create({
			data: {
				threadId: thread.id,
				rfcMessageId: `agentmail:${message.message_id}`,
				provider: EmailProvider.AGENTMAIL,
				externalInboxId: message.inbox_id,
				externalThreadId: message.thread_id,
				externalMessageId: message.message_id,
				direction: EmailDirection.INBOUND,
				fromEmail: sender.email,
				fromName: sender.name,
				recipients: recipients(message),
				subject: clean(message.subject),
				snippet: clean(message.preview),
				body:
					clean(message.extracted_text) ??
					clean(message.text) ??
					clean(message.preview),
				sentAt,
			},
			select: { id: true },
		});

		await tx.emailProviderEvent.create({
			data: {
				provider: EmailProvider.AGENTMAIL,
				eventType: EmailEventType.INBOUND,
				externalEventId: `poll:${message.message_id}`,
				externalInboxId: message.inbox_id,
				externalThreadId: message.thread_id,
				externalMessageId: message.message_id,
				inboxId,
				messageId: record.id,
				payload: json(message),
			},
		});

		const outbound = await tx.emailDraft.findFirst({
			where: {
				threadId: thread.id,
				sequenceId: { not: null },
				sentAt: { not: null },
			},
			select: { sequenceId: true },
		});
		if (outbound?.sequenceId) {
			await tx.emailDraft.updateMany({
				where: {
					sequenceId: outbound.sequenceId,
					status: "APPROVED",
					sentAt: null,
				},
				data: {
					status: "REJECTED",
					sendError: "Sequence stopped automatically after a reply.",
				},
			});
		}

		const aggregate = await tx.emailMessage.aggregate({
			where: { threadId: thread.id },
			_count: { _all: true },
			_min: { sentAt: true },
			_max: { sentAt: true },
		});
		await tx.emailThread.update({
			where: { id: thread.id },
			data: {
				messageCount: aggregate._count._all,
				firstMessageAt: aggregate._min.sentAt ?? sentAt,
				lastMessageAt: aggregate._max.sentAt ?? sentAt,
			},
		});

		const author = await tx.user.findFirst({
			orderBy: { createdAt: "asc" },
			select: { id: true },
		});
		const activity = author
			? await tx.activity.findUnique({
					where: { emailThreadId: thread.id },
					select: { id: true },
				})
			: null;
		if (author && !activity) {
			await tx.activity.create({
				data: {
					type: ActivityType.EMAIL,
					subject: clean(message.subject) ?? `Email from ${sender.email}`,
					body: clean(message.preview),
					occurredAt: sentAt,
					companyId: match.companyId,
					contactId: match.contactId,
					createdById: author.id,
					emailThreadId: thread.id,
					meta: { source: "agentmail" },
				},
			});
		}

		return true;
	});
}

async function listMessages(input: {
	apiUrl: string;
	apiKey: string;
	inboxId: string;
	after: Date | null;
	pageToken: string | null;
	request: typeof fetch;
}) {
	const url = new URL(
		`/v0/inboxes/${encodeURIComponent(input.inboxId)}/messages`,
		input.apiUrl,
	);
	url.searchParams.set("limit", String(PAGE_SIZE));
	url.searchParams.set("ascending", "true");
	if (input.after) url.searchParams.set("after", input.after.toISOString());
	if (input.pageToken) url.searchParams.set("page_token", input.pageToken);

	const response = await input.request(url, {
		headers: { authorization: `Bearer ${input.apiKey}` },
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok)
		throw new Error(`AgentMail message list returned ${response.status}.`);
	return listSchema.parse(await response.json());
}

async function getMessage(input: {
	apiUrl: string;
	apiKey: string;
	inboxId: string;
	messageId: string;
	request: typeof fetch;
}): Promise<AgentMailMessage> {
	const url = new URL(
		`/v0/inboxes/${encodeURIComponent(input.inboxId)}/messages/${encodeURIComponent(input.messageId)}`,
		input.apiUrl,
	);
	const response = await input.request(url, {
		headers: { authorization: `Bearer ${input.apiKey}` },
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok)
		throw new Error(`AgentMail message read returned ${response.status}.`);
	return messageSchema.parse(await response.json());
}

async function matchSender(email: string, database: Db): Promise<Match> {
	if (await isSuppressed(email, database)) {
		return { companyId: null, contactId: null };
	}

	const contact = await database.contact.findFirst({
		where: { email: { equals: email, mode: "insensitive" } },
		select: { id: true, companyId: true },
	});
	if (contact) return { companyId: contact.companyId, contactId: contact.id };

	const prospect = await database.prospect.findFirst({
		where: { routeEmail: { equals: email, mode: "insensitive" } },
		select: { companyId: true, contactId: true },
	});
	if (prospect?.companyId || prospect?.contactId) return prospect;

	const domain = email.split("@")[1]?.toLowerCase();
	if (!domain) return { companyId: null, contactId: null };
	const company = await database.company.findUnique({
		where: { domain },
		select: { id: true },
	});
	return { companyId: company?.id ?? null, contactId: null };
}

async function isSuppressed(email: string, database: Db): Promise<boolean> {
	const domain = email.split("@")[1]?.toLowerCase();
	const [contact, domainRow] = await Promise.all([
		database.suppressedContact.findUnique({ where: { email } }),
		domain ? database.suppressedDomain.findUnique({ where: { domain } }) : null,
	]);
	return Boolean(contact || domainRow);
}

function parseAddress(
	value: string,
): { email: string; name: string | null } | null {
	const bracketed = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
	const email = (bracketed?.[2] ?? value).trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;
	return { email, name: clean(bracketed?.[1]) };
}

function recipients(message: AgentMailMessage): Prisma.InputJsonArray {
	return [
		...message.to.map((value) => ({ value, kind: "to" })),
		...(message.cc ?? []).map((value) => ({ value, kind: "cc" })),
		...(message.bcc ?? []).map((value) => ({ value, kind: "bcc" })),
	].flatMap(({ value, kind }) => {
		const person = parseAddress(value);
		return person ? [{ ...person, kind }] : [];
	}) as Prisma.InputJsonArray;
}

function clean(value: string | null | undefined): string | null {
	const result = value?.trim();
	return result ? result : null;
}

function maxDate(left: Date | null, right: Date): Date | null {
	if (Number.isNaN(right.getTime())) return left;
	if (!left) return right;
	return right > left ? right : left;
}

function json(value: unknown): Prisma.InputJsonValue {
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
