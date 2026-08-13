import type { Db } from "@crm/db";
import { classifyTouch, type RawTouch, type Touch } from "@crm/db/attribution";
import {
	dedupeKey,
	EVENTS_PER_MINUTE,
	hostAllowed,
	MAX_EVENTS_PER_BATCH,
	matchedHost,
	normalizePath,
	originAllowed,
	rateWindowKey,
	stripQuery,
	type TrackingConfig,
} from "@crm/db/tracking";
import { Injectable, Logger } from "@nestjs/common";
import { normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { TrackingConfigService } from "./tracking-config.service";
import { TrackingCounterService } from "./tracking-counter.service";
import { TrackingFilingService } from "./tracking-filing.service";

const MAX_LABEL = 80;

const MAX_PATH = 512;

const MAX_HOST = 253;

const KEPT = new Set(["page_view", "click", "form_submit"]);

const BOT = /bot|crawler|spider|crawling|headlesschrome|lighthouse|preview/i;

const SENSITIVE = /pass|secret|token|card|cvv|cvc|ssn|iban|routing/i;

const CARD = /^[0-9 -]{12,25}$/;

const ADDRESS = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export interface IncomingEvent {
	type: string;
	host: string;
	path: string;
	referrer?: string;
	label?: string;
	at?: number;
	fields?: Record<string, string>;
	touch?: RawTouch;
	firstTouch?: RawTouch;
}

export interface IncomingBatch {
	siteId: string;
	visitorId: string;
	events: IncomingEvent[];
}

interface AcceptedEvent {
	event: IncomingEvent;
	host: string;
}

@Injectable()
export class TrackingIngestService {
	private readonly logger = new Logger(TrackingIngestService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: TrackingConfigService,
		private readonly counters: TrackingCounterService,
		private readonly filing: TrackingFilingService,
	) {}

	async accept(
		batch: IncomingBatch,
		request: { origin: string | null; userAgent: string | null },
	): Promise<void> {
		if (request.userAgent && BOT.test(request.userAgent)) return;

		const compiled = await this.config.forSite(batch.siteId);
		if (!compiled) return;

		if (!originAllowed(request.origin, compiled.config)) return;

		const visitorId = sanitizeId(batch.visitorId);
		if (!visitorId) return;

		const events = batch.events.slice(0, MAX_EVENTS_PER_BATCH);
		if (scripted(events)) return;

		const accepted = events.flatMap<AcceptedEvent>((event) => {
			if (!KEPT.has(event.type)) return [];

			const host = event.host?.toLowerCase().trim().slice(0, MAX_HOST);

			return host && hostAllowed(host, compiled.config)
				? [{ event, host }]
				: [];
		});

		if (accepted.length === 0) return;
		if (!(await this.withinRate(accepted.length))) return;

		await this.seen(visitorId, accepted);

		const pageViews = accepted.filter(
			({ event }) => event.type === "page_view" || event.type === "click",
		);
		const forms = accepted.filter(({ event }) => event.type === "form_submit");

		if (pageViews.length > 0) {
			await this.events(visitorId, pageViews, compiled.config);
		}

		for (const form of forms) {
			await this.submission(visitorId, form);
		}
	}

	private async seen(
		visitorId: string,
		accepted: AcceptedEvent[],
	): Promise<void> {
		const stamps = accepted.map(({ event }) => occurredAt(event.at).getTime());
		const firstSeen = new Date(Math.min(...stamps));
		const lastSeen = new Date(Math.max(...stamps));

		await this.db.$executeRaw`
			INSERT INTO "trackedVisitor" ("id", "firstSeen", "lastSeen")
			VALUES (${visitorId}, ${firstSeen}, ${lastSeen})
			ON CONFLICT ("id") DO UPDATE
				SET "firstSeen" = LEAST("trackedVisitor"."firstSeen", EXCLUDED."firstSeen"),
					"lastSeen" = GREATEST("trackedVisitor"."lastSeen", EXCLUDED."lastSeen");
		`;
	}

	private async events(
		visitorId: string,
		accepted: AcceptedEvent[],
		config: TrackingConfig,
	): Promise<void> {
		const rows = accepted.map(({ event, host }) => {
			const touch =
				event.type === "page_view" && event.touch
					? classifyTouch(arriving(event.touch))
					: null;

			const referrer = stripQuery(event.referrer);

			return {
				visitorId,
				type: event.type,
				host,
				path: trim(normalizePath(event.path), MAX_PATH),
				referrer: referrer ? trim(referrer, MAX_PATH) : null,
				label: event.label ? trim(event.label, MAX_LABEL) : null,
				source: touch?.source ?? null,
				medium: touch?.medium ?? null,
				campaign: touch?.campaign ?? null,
				occurredAt: occurredAt(event.at),
			};
		});

		await this.db.trackedEvent.createMany({ data: rows });

		await this.countViews(rows, config);
	}

	private async countViews(
		rows: { host: string; type: string }[],
		config: TrackingConfig,
	): Promise<void> {
		const tallies = new Map<string, number>();

		for (const row of rows) {
			const entry = matchedHost(row.host, config);
			if (!entry) continue;

			const views = tallies.get(entry.host) ?? 0;
			tallies.set(entry.host, views + (row.type === "page_view" ? 1 : 0));
		}

		const lastSeenAt = new Date();

		await Promise.all(
			[...tallies].map(([host, views]) =>
				this.db.trackedDomain.updateMany({
					where: { host },
					data: { pageViews: { increment: views }, lastSeenAt },
				}),
			),
		);
	}

	private async submission(
		visitorId: string,
		{ event, host }: AcceptedEvent,
	): Promise<void> {
		const fields = clean(event.fields ?? {});
		const email = emailFrom(fields);
		const path = trim(normalizePath(event.path), MAX_PATH);
		const at = occurredAt(event.at);

		const lastTouch = classifyTouch(arriving(event.touch ?? {}), at);
		const firstTouch = event.firstTouch
			? classifyTouch(arriving(event.firstTouch), at)
			: lastTouch;

		const key = dedupeKey({ host, path, email, at });

		const created = await this.db.formSubmission.createMany({
			data: [
				{
					visitorId,
					host,
					path,
					email,
					fields,
					firstTouch: stored(firstTouch),
					lastTouch: stored(lastTouch),
					dedupeKey: key,
				},
			],
			skipDuplicates: true,
		});

		const submission = await this.db.formSubmission.findUnique({
			where: { dedupeKey: key },
			select: { id: true, filedAt: true, skipReason: true },
		});

		if (!submission) return;
		if (created.count === 0 && !unfiled(submission)) return;

		const outcome = await this.filing.file({
			id: submission.id,
			email,
			host,
			visitorId,
			name: nameFrom(fields),
			firstTouch,
			lastTouch,
		});

		if (!outcome.filed) {
			this.logger.log({
				message: "Form submission stored but not filed",
				host,
				reason: outcome.reason,
			});
		}
	}

	private async withinRate(events: number): Promise<boolean> {
		return this.counters.take(rateWindowKey(), EVENTS_PER_MINUTE, events);
	}
}

function unfiled(submission: {
	filedAt: Date | null;
	skipReason: string | null;
}): boolean {
	return submission.filedAt === null && submission.skipReason === null;
}

function arriving(touch: RawTouch): RawTouch {
	return {
		...touch,
		referrer: stripQuery(touch.referrer) ?? undefined,
		landing: stripQuery(touch.landing) ?? undefined,
	};
}

function stored(touch: Touch): Record<string, string | null> {
	return {
		source: touch.source,
		medium: touch.medium,
		campaign: touch.campaign,
		term: touch.term,
		content: touch.content,
		referrer: touch.referrer,
		landing: touch.landing,
		at: touch.at.toISOString(),
	};
}

function scripted(events: IncomingEvent[]): boolean {
	if (events.length < 3) return false;

	const stamps = events.flatMap((event) =>
		typeof event.at === "number" && Number.isFinite(event.at) ? [event.at] : [],
	);

	if (stamps.length !== events.length) return false;

	return new Set(stamps).size === 1;
}

function occurredAt(at: number | undefined): Date {
	const now = Date.now();
	if (typeof at !== "number" || !Number.isFinite(at)) return new Date(now);

	const bounded = Math.min(Math.max(at, now - 86_400_000), now);

	return new Date(bounded);
}

function trim(value: string, max: number): string {
	return value.length > max ? value.slice(0, max) : value;
}

function sanitizeId(value: string | undefined): string | null {
	if (typeof value !== "string") return null;

	const trimmed = value.trim();

	return /^[a-zA-Z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

function clean(fields: Record<string, string>): Record<string, string> {
	const kept: Record<string, string> = {};

	for (const [key, value] of Object.entries(fields).slice(0, 40)) {
		if (typeof value !== "string") continue;
		if (SENSITIVE.test(key)) continue;
		if (CARD.test(value.trim())) continue;

		kept[trim(key, 64)] = trim(value, 512);
	}

	return kept;
}

function emailFrom(fields: Record<string, string>): string | null {
	for (const [key, value] of Object.entries(fields)) {
		if (!/mail/i.test(key)) continue;
		const email = address(value);
		if (email) return email;
	}

	for (const value of Object.values(fields)) {
		const email = address(value);
		if (email) return email;
	}

	return null;
}

function address(value: string): string | null {
	const email = normalizeEmail(value);

	return email && ADDRESS.test(email) ? email : null;
}

function nameFrom(fields: Record<string, string>): string | null {
	const first = pick(fields, /^(first[\s_-]?name|fname|given)/i);
	const last = pick(fields, /^(last[\s_-]?name|lname|surname|family)/i);

	if (first) return last ? `${first} ${last}` : first;

	return pick(fields, /^(full[\s_-]?name|name)$/i) ?? pick(fields, /name/i);
}

function pick(fields: Record<string, string>, pattern: RegExp): string | null {
	for (const [key, value] of Object.entries(fields)) {
		if (pattern.test(key) && value.trim()) return value.trim();
	}

	return null;
}
