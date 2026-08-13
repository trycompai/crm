import type { Db } from "../client";
import type { Prisma } from "../generated/prisma/client";
import type {
	MarketingSendOrigin,
	MarketingSendStatus,
} from "../generated/prisma/enums";
import { campaignAudienceWhere } from "./audience";
import { emailContent } from "./drips";
import { recipientsFor, type SkipReason, skipFor } from "./recipients";
import { segmentWhere } from "./segments";
import { MARKETING } from "./settings";

export type { SkipReason } from "./recipients";

const CAPPED_ORIGINS = new Set<MarketingSendOrigin>(["CAMPAIGN", "DRIP"]);

export type MaterialiseResult = {
	queued: number;
	skipped: Record<string, number>;
	total: number;
};

export function contactsIn(
	db: Db,
	where: Prisma.ContactWhereInput,
): Promise<{ id: string; email: string | null }[]> {
	return db.contact.findMany({ where, select: { id: true, email: true } });
}

export async function audienceFor(
	db: Db,
	segmentId: string,
): Promise<{ id: string; email: string | null }[]> {
	const segment = await db.marketingSegment.findUnique({
		where: { id: segmentId },
		select: {
			definition: true,
			members: { select: { contactId: true, mode: true } },
		},
	});

	if (!segment) return [];

	return contactsIn(db, segmentWhere(segment));
}

export async function materialise(
	db: Db,
	campaignId: string,
	options: { dueAt?: Date } = {},
): Promise<MaterialiseResult> {
	const campaign = await db.marketingCampaign.findUnique({
		where: { id: campaignId },
		select: {
			id: true,
			fromName: true,
			replyTo: true,
			scheduledAt: true,
			nodes: {
				select: {
					id: true,
					subject: true,
					preheader: true,
					document: true,
					kind: true,
					template: {
						select: { subject: true, preheader: true, document: true },
					},
				},
			},
		},
	});

	if (!campaign) return { queued: 0, skipped: {}, total: 0 };

	const where = await campaignAudienceWhere(db, campaign.id);
	if (!where) return { queued: 0, skipped: {}, total: 0 };

	const node = campaign.nodes.find((candidate) => candidate.kind === "EMAIL");
	if (!node) return { queued: 0, skipped: {}, total: 0 };

	const content = emailContent(node);

	const contacts = await contactsIn(db, where);
	const withEmail = contacts.filter((contact) => contact.email);
	const recipients = await recipientsFor(
		db,
		withEmail.map((contact) => ({
			address: contact.email as string,
			contactId: contact.id,
		})),
	);

	const dueAt = options.dueAt ?? campaign.scheduledAt ?? new Date();
	const skipped: Record<string, number> = {};
	const rows: Prisma.MarketingSendCreateManyInput[] = [];

	for (const contact of contacts) {
		if (!contact.email) {
			skipped["no-address"] = (skipped["no-address"] ?? 0) + 1;
			continue;
		}

		const recipient = recipients.get(contact.email.toLowerCase());
		if (!recipient) {
			skipped["no-address"] = (skipped["no-address"] ?? 0) + 1;
			continue;
		}

		const reason = skipFor(recipient.status);

		rows.push({
			campaignId: campaign.id,
			nodeId: node.id,
			recipientId: recipient.id,
			contactId: contact.id,
			origin: "CAMPAIGN",
			pass: 1,
			fromName: campaign.fromName,
			subject: content.subject,
			preheader: content.preheader,
			document: content.document,
			replyTo: campaign.replyTo,
			status: reason ? "SKIPPED" : "QUEUED",
			skipReason: reason,
			dueAt,
		});

		if (reason) skipped[reason] = (skipped[reason] ?? 0) + 1;
	}

	await db.marketingSend.createMany({ data: rows, skipDuplicates: true });

	const queued =
		rows.length - Object.values(skipped).reduce((sum, n) => sum + n, 0);

	await db.marketingCampaign.update({
		where: { id: campaign.id },
		data: { totalRecipients: rows.length },
	});

	return { queued, skipped, total: rows.length };
}

export type DirectSend = {
	address: string;
	contactId?: string | null;
	fromName?: string | null;
	subject: string;
	preheader?: string | null;
	document: unknown;
	replyTo?: string | null;
	requestedById?: string | null;
	origin?: MarketingSendOrigin;
	dueAt?: Date;
};

export type DirectResult =
	| { ok: true; sendId: string }
	| { ok: false; reason: SkipReason | "invalid-address" };

export async function queueDirect(
	db: Db,
	input: DirectSend,
): Promise<DirectResult> {
	const recipients = await recipientsFor(db, [
		{ address: input.address, contactId: input.contactId ?? null },
	]);
	const recipient = [...recipients.values()][0];

	if (!recipient) return { ok: false, reason: "invalid-address" };

	const reason = skipFor(recipient.status);
	if (reason) return { ok: false, reason };

	const send = await db.marketingSend.create({
		data: {
			recipientId: recipient.id,
			contactId: input.contactId ?? recipient.contactId,
			origin: input.origin ?? "DIRECT",
			fromName: input.fromName ?? null,
			subject: input.subject,
			preheader: input.preheader ?? null,
			document: input.document as Prisma.InputJsonValue,
			replyTo: input.replyTo ?? null,
			requestedById: input.requestedById ?? null,
			dueAt: input.dueAt ?? new Date(),
		},
		select: { id: true },
	});

	return { ok: true, sendId: send.id };
}

export function hourIn(timeZone: string, at: Date): number {
	const formatter = new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		hour12: false,
	});

	return Number.parseInt(formatter.format(at), 10) % 24;
}

export function isQuiet(hour: number, start: number, end: number): boolean {
	if (start === end) return false;
	return start < end
		? hour >= start && hour < end
		: hour >= start || hour < end;
}

export function nextOpen(
	at: Date,
	timeZone: string,
	start: number,
	end: number,
): Date {
	const step = new Date(at);
	step.setUTCMinutes(0, 0, 0);

	for (let hop = 0; hop < MARKETING.defer.maxHours; hop += 1) {
		step.setUTCHours(step.getUTCHours() + 1);
		if (!isQuiet(hourIn(timeZone, step), start, end)) return new Date(step);
	}

	return at;
}

export type QuietWindow = {
	start: number | null;
	end: number | null;
	timeZone: string;
	now?: Date;
};

export async function deferQuiet(
	db: Db,
	window: QuietWindow,
): Promise<{ deferred: number; until: Date | null }> {
	const { start, end } = window;
	if (start === null || end === null || start === end) {
		return { deferred: 0, until: null };
	}

	const now = window.now ?? new Date();
	if (!isQuiet(hourIn(window.timeZone, now), start, end)) {
		return { deferred: 0, until: null };
	}

	const until = nextOpen(now, window.timeZone, start, end);

	const result = await db.marketingSend.updateMany({
		where: {
			status: "QUEUED",
			dueAt: { lte: now },
			origin: { in: ["CAMPAIGN", "DRIP"] },
		},
		data: { dueAt: until },
	});

	return { deferred: result.count, until };
}

export async function skipOverCap(
	db: Db,
	claimed: ClaimedSend[],
	cap: number,
	now: Date = new Date(),
): Promise<ClaimedSend[]> {
	if (cap <= 0 || claimed.length === 0) return claimed;

	const capped = claimed.filter((send) => CAPPED_ORIGINS.has(send.origin));
	if (capped.length === 0) return claimed;

	const since = new Date(now.getTime() - MARKETING.cap.windowMs);

	const counts = await db.marketingSend.groupBy({
		by: ["recipientId"],
		where: {
			recipientId: { in: capped.map((send) => send.recipientId) },
			sentAt: { gte: since },
		},
		_count: { _all: true },
	});

	const sent = new Map(
		counts.map((row) => [row.recipientId, row._count._all] as const),
	);

	const allowed: ClaimedSend[] = [];
	const over: string[] = [];

	for (const send of claimed) {
		if (!CAPPED_ORIGINS.has(send.origin)) {
			allowed.push(send);
			continue;
		}

		const already = sent.get(send.recipientId) ?? 0;
		if (already >= cap) {
			over.push(send.id);
			continue;
		}

		sent.set(send.recipientId, already + 1);
		allowed.push(send);
	}

	if (over.length > 0) {
		await db.marketingSend.updateMany({
			where: { id: { in: over } },
			data: { status: "SKIPPED", skipReason: "daily-cap" },
		});
	}

	return allowed;
}

export type ClaimedSend = {
	id: string;
	recipientId: string;
	address: string;
	token: string;
	origin: MarketingSendOrigin;
	contactId: string | null;
	campaignId: string | null;
	nodeId: string | null;
	fromName: string | null;
	subject: string | null;
	preheader: string | null;
	document: unknown;
	replyTo: string | null;
	attempts: number;
	hasAttachments: boolean;
	attachments: { filename: string; url: string }[];
};

export async function claimDueSends(
	db: Db,
	limit: number = MARKETING.drain.claimLimit,
): Promise<ClaimedSend[]> {
	const now = new Date();
	const leaseCutoff = new Date(now.getTime() - MARKETING.drain.leaseMs);

	const claimed = await db.$queryRaw<{ id: string }[]>`
		WITH due AS (
			SELECT s.id
			FROM "marketingSend" s
			WHERE s."dueAt" <= ${now}
				AND s.attempts < ${MARKETING.drain.maxAttempts}
				AND (
					s.status = 'QUEUED'
					OR (s.status = 'SENDING' AND (s."leasedAt" IS NULL OR s."leasedAt" < ${leaseCutoff}))
				)
			ORDER BY s."dueAt" ASC
			LIMIT ${limit}
			FOR UPDATE SKIP LOCKED
		)
		UPDATE "marketingSend" s
		SET status = 'SENDING', "leasedAt" = ${now}, attempts = s.attempts + 1
		FROM due
		WHERE s.id = due.id
		RETURNING s.id
	`;

	if (claimed.length === 0) return [];

	const rows = await db.marketingSend.findMany({
		where: { id: { in: claimed.map((row) => row.id) } },
		select: {
			id: true,
			recipientId: true,
			origin: true,
			contactId: true,
			campaignId: true,
			nodeId: true,
			fromName: true,
			subject: true,
			preheader: true,
			document: true,
			replyTo: true,
			attempts: true,
			recipient: { select: { address: true, token: true, status: true } },
			attachments: { select: { filename: true, url: true } },
			campaign: {
				select: { attachments: { select: { filename: true, url: true } } },
			},
		},
	});

	const sendable: ClaimedSend[] = [];
	const blocked = new Map<SkipReason, string[]>();

	for (const row of rows) {
		const reason = skipFor(row.recipient.status);

		if (reason) {
			blocked.set(reason, [...(blocked.get(reason) ?? []), row.id]);
			continue;
		}

		sendable.push({
			id: row.id,
			recipientId: row.recipientId,
			address: row.recipient.address,
			token: row.recipient.token,
			origin: row.origin,
			contactId: row.contactId,
			campaignId: row.campaignId,
			nodeId: row.nodeId,
			fromName: row.fromName,
			subject: row.subject,
			preheader: row.preheader,
			document: row.document,
			replyTo: row.replyTo,
			attempts: row.attempts,
			hasAttachments:
				row.attachments.length + (row.campaign?.attachments.length ?? 0) > 0,
			attachments: [...row.attachments, ...(row.campaign?.attachments ?? [])],
		});
	}

	if (blocked.size > 0) {
		await db.$transaction(
			[...blocked].map(([reason, ids]) =>
				db.marketingSend.updateMany({
					where: { id: { in: ids } },
					data: { status: "SKIPPED", skipReason: reason },
				}),
			),
		);
	}

	return sendable;
}

export type Outcome =
	| { ok: true; providerId: string }
	| { ok: false; error: string; retry: boolean };

export async function settle(
	db: Db,
	sendId: string,
	outcome: Outcome,
): Promise<void> {
	if (outcome.ok) {
		const now = new Date();
		await db.$transaction([
			db.marketingSend.update({
				where: { id: sendId },
				data: {
					status: "SENT",
					sentAt: now,
					providerId: outcome.providerId,
					error: null,
				},
			}),
			db.marketingEvent.create({ data: { sendId, type: "SENT", at: now } }),
		]);

		const send = await db.marketingSend.findUnique({
			where: { id: sendId },
			select: { recipientId: true },
		});

		if (send) {
			await db.marketingRecipient.update({
				where: { id: send.recipientId },
				data: { lastSentAt: now },
			});
		}
		return;
	}

	const attempted = await db.marketingSend.findUnique({
		where: { id: sendId },
		select: { attempts: true },
	});

	const retry =
		outcome.retry && (attempted?.attempts ?? 0) < MARKETING.drain.maxAttempts;

	const status: MarketingSendStatus = retry ? "QUEUED" : "FAILED";

	await db.marketingSend.update({
		where: { id: sendId },
		data: {
			status,
			error: outcome.error.slice(0, 500),
			leasedAt: null,
			...(retry && {
				dueAt: new Date(Date.now() + MARKETING.drain.retryBackoffMs),
			}),
		},
	});

	if (!retry) {
		await db.marketingEvent.create({ data: { sendId, type: "FAILED" } });
	}
}

export type Health = {
	sent: number;
	delivered: number;
	bounced: number;
	complained: number;
	bounceRate: number;
	complaintRate: number;
};

export async function healthOf(db: Db, campaignId: string): Promise<Health> {
	const [sent, delivered, bounced, complained] = await Promise.all([
		db.marketingSend.count({
			where: {
				campaignId,
				status: { in: ["SENT", "DELIVERED", "BOUNCED", "COMPLAINED"] },
			},
		}),
		db.marketingSend.count({ where: { campaignId, status: "DELIVERED" } }),
		db.marketingSend.count({ where: { campaignId, status: "BOUNCED" } }),
		db.marketingSend.count({ where: { campaignId, status: "COMPLAINED" } }),
	]);

	return {
		sent,
		delivered,
		bounced,
		complained,
		bounceRate: sent > 0 ? bounced / sent : 0,
		complaintRate: sent > 0 ? complained / sent : 0,
	};
}

export const PAUSE_SKIP_REASONS = {
	byPerson: "the campaign is paused",
	bySystem: "the campaign paused itself",
} as const;

export async function pauseUnhealthy(db: Db): Promise<string[]> {
	const live = await db.marketingCampaign.findMany({
		where: { status: { in: ["SENDING", "ACTIVE"] } },
		select: { id: true, status: true },
	});

	const paused: string[] = [];

	for (const campaign of live) {
		const health = await healthOf(db, campaign.id);
		if (health.sent < MARKETING.deliverability.floor) continue;

		const reason =
			health.bounceRate >= MARKETING.deliverability.bouncePause
				? `Paused on its own: ${(health.bounceRate * 100).toFixed(1)}% of these bounced. That damages the domain every other campaign shares, and the damage outlasts this one.`
				: health.complaintRate >= MARKETING.deliverability.complaintPause
					? `Paused on its own: ${(health.complaintRate * 100).toFixed(2)}% marked this as spam, which is past what Google tolerates from a sender.`
					: null;

		if (!reason) continue;

		await db.marketingCampaign.update({
			where: { id: campaign.id },
			data: { status: "PAUSED", pausedReason: reason },
		});

		await db.marketingSend.updateMany({
			where: { campaignId: campaign.id, status: "QUEUED" },
			data: { status: "SKIPPED", skipReason: PAUSE_SKIP_REASONS.bySystem },
		});

		paused.push(campaign.id);
	}

	return paused;
}

export async function finishCampaigns(db: Db): Promise<void> {
	const sending = await db.marketingCampaign.findMany({
		where: { kind: "BLAST", status: "SENDING" },
		select: { id: true },
	});

	for (const campaign of sending) {
		const outstanding = await db.marketingSend.count({
			where: { campaignId: campaign.id, status: { in: ["QUEUED", "SENDING"] } },
		});

		if (outstanding === 0) {
			await db.marketingCampaign.update({
				where: { id: campaign.id },
				data: { status: "SENT", finishedAt: new Date() },
			});
		}
	}
}

export const EVENT_KEEP_FOREVER = [
	"BOUNCED",
	"COMPLAINED",
	"UNSUBSCRIBED",
] as const;

export async function sweepEvents(
	db: Db,
	before: Date,
	limit = MARKETING.retention.batch,
): Promise<{ removed: number; complete: boolean }> {
	const stale = await db.marketingEvent.findMany({
		where: {
			at: { lt: before },
			type: { notIn: [...EVENT_KEEP_FOREVER] },
		},
		select: { id: true },
		take: limit,
	});

	if (stale.length === 0) return { removed: 0, complete: true };

	const result = await db.marketingEvent.deleteMany({
		where: { id: { in: stale.map((row) => row.id) } },
	});

	return { removed: result.count, complete: stale.length < limit };
}

export async function startDueCampaigns(db: Db): Promise<void> {
	await db.marketingCampaign.updateMany({
		where: {
			kind: "BLAST",
			status: "SCHEDULED",
			scheduledAt: { lte: new Date() },
		},
		data: { status: "SENDING", startedAt: new Date() },
	});
}
