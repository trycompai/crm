import type { Db } from "@crm/db";
import { classifyTouch, type RawTouch, type Touch } from "@crm/db/attribution";
import {
	dedupeKey,
	EVENTS_PER_MINUTE,
	hostAllowed,
	MAX_EVENTS_PER_BATCH,
	originAllowed,
	rateWindowKey,
	type TrackingConfig,
} from "@crm/db/tracking";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { TrackingConfigService } from "./tracking-config.service";
import { TrackingFilingService } from "./tracking-filing.service";

const RATE_KEY = "tracking";

const MAX_LABEL = 80;

const MAX_PATH = 512;

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

@Injectable()
export class TrackingIngestService {
	private readonly logger = new Logger(TrackingIngestService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
		private readonly config: TrackingConfigService,
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
		if (!(await this.withinRate())) return;

		const visitorId = sanitizeId(batch.visitorId);
		if (!visitorId) return;

		const events = batch.events.slice(0, MAX_EVENTS_PER_BATCH);
		if (scripted(events)) return;

		const pageViews = events.filter(
			(event) => event.type === "page_view" || event.type === "click",
		);
		const forms = events.filter((event) => event.type === "form_submit");

		if (pageViews.length > 0) {
			await this.events(visitorId, pageViews, compiled.config);
		}

		for (const form of forms) {
			await this.submission(visitorId, form, compiled.config);
		}
	}

	private async events(
		visitorId: string,
		events: IncomingEvent[],
		config: TrackingConfig,
	): Promise<void> {
		const rows = events.flatMap((event) => {
			const host = event.host?.toLowerCase().trim();
			if (!host || !hostAllowed(host, config)) return [];

			const touch =
				event.type === "page_view" && event.touch
					? classifyTouch(event.touch)
					: null;

			return [
				{
					visitorId,
					type: event.type,
					host,
					path: trim(event.path ?? "/", MAX_PATH),
					referrer: event.referrer ? trim(event.referrer, MAX_PATH) : null,
					label: event.label ? trim(event.label, MAX_LABEL) : null,
					source: touch?.source ?? null,
					medium: touch?.medium ?? null,
					campaign: touch?.campaign ?? null,
					occurredAt: occurredAt(event.at),
				},
			];
		});

		if (rows.length === 0) return;

		await this.db.trackedEvent.createMany({ data: rows });

		const hosts = [...new Set(rows.map((row) => row.host))];
		const views = rows.filter((row) => row.type === "page_view").length;

		await this.db.trackedDomain.updateMany({
			where: { host: { in: hosts } },
			data: { pageViews: { increment: views }, lastSeenAt: new Date() },
		});
	}

	private async submission(
		visitorId: string,
		event: IncomingEvent,
		config: TrackingConfig,
	): Promise<void> {
		const host = event.host?.toLowerCase().trim();
		if (!host || !hostAllowed(host, config)) return;

		const fields = clean(event.fields ?? {});
		const email = emailFrom(fields);
		const path = trim(event.path ?? "/", MAX_PATH);
		const at = occurredAt(event.at);

		const lastTouch = classifyTouch(event.touch ?? {}, at);
		const firstTouch = event.firstTouch
			? classifyTouch(event.firstTouch, at)
			: lastTouch;

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
					dedupeKey: dedupeKey({ host, path, email, at }),
				},
			],
			skipDuplicates: true,
		});

		if (created.count === 0) return;

		const submission = await this.db.formSubmission.findUnique({
			where: { dedupeKey: dedupeKey({ host, path, email, at }) },
			select: { id: true },
		});

		if (!submission) return;

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

	private async withinRate(): Promise<boolean> {
		const now = Date.now();
		const key = `${RATE_KEY}:${rateWindowKey(new Date(now))}`;
		const untilWindowCloses = 60_000 - (now % 60_000) + 5_000;

		try {
			const used = (await this.cache.get<number>(key)) ?? 0;
			if (used >= EVENTS_PER_MINUTE) return false;

			await this.cache.set(key, used + 1, untilWindowCloses);

			return true;
		} catch {
			return true;
		}
	}
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

	const stamps = new Set(events.map((event) => event.at));

	return stamps.size === 1;
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
