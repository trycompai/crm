import type { IncomingMessage } from "node:http";
import type { Db } from "@crm/db";
import { MARKETING, sweepEvents } from "@crm/db/marketing";
import {
	EVENT_RETENTION_DAYS,
	isSiteId,
	MAX_BODY_BYTES,
	MAX_SWEEP_PASSES,
	SWEEP_BATCH,
} from "@crm/db/tracking";
import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
	HttpCode,
	Logger,
	Param,
	Post,
	Req,
	Res,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Response } from "express";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { TrackingConfigService } from "./tracking-config.service";
import { TrackingCounterService } from "./tracking-counter.service";
import {
	type IncomingBatch,
	TrackingIngestService,
} from "./tracking-ingest.service";
import { TrackingRollupService } from "./tracking-rollup.service";

@Controller("api/t")
export class TrackingController {
	private readonly logger = new Logger(TrackingController.name);

	constructor(
		private readonly config: TrackingConfigService,
		private readonly ingest: TrackingIngestService,
	) {}

	@Get("config/:siteId")
	@AllowAnonymous()
	async publicConfig(@Param("siteId") siteId: string) {
		if (!isSiteId(siteId)) return { config: null };

		const compiled = await this.config.forSite(siteId);

		return compiled
			? { config: compiled.config, hash: compiled.hash }
			: { config: null };
	}

	@Post("e")
	@AllowAnonymous()
	@HttpCode(204)
	async collect(
		@Req() request: IncomingMessage,
		@Res({ passthrough: true }) response: Response,
		@Headers("origin") origin?: string,
		@Headers("user-agent") userAgent?: string,
	): Promise<void> {
		response.setHeader("cross-origin-resource-policy", "cross-origin");

		const raw = await read(request, MAX_BODY_BYTES);
		if (!raw) return;

		let batch: IncomingBatch;
		try {
			batch = JSON.parse(raw) as IncomingBatch;
		} catch {
			return;
		}

		if (!isSiteId(batch?.siteId) || !Array.isArray(batch?.events)) return;

		try {
			await this.ingest.accept(batch, {
				origin: origin ?? null,
				userAgent: userAgent ?? null,
			});
		} catch (error) {
			this.logger.error(
				{ message: "Tracking event was not stored" },
				error instanceof Error ? error.stack : String(error),
			);
		}
	}
}

@Controller("internal/tracking")
export class TrackingRetentionController {
	private readonly logger = new Logger(TrackingRetentionController.name);
	private readonly secret: string | undefined;

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly rollups: TrackingRollupService,
		private readonly counters: TrackingCounterService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Get("retention")
	@AllowAnonymous()
	async viaGet(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	@Post("retention")
	@AllowAnonymous()
	async viaPost(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	private async run(authorization?: string) {
		if (!this.secret) {
			this.logger.error({
				message: "CRON_SECRET is not set — refusing to run tracking retention.",
			});
			throw new ServiceUnavailableException("Retention is not configured.");
		}

		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}

		const before = startOfDay(
			new Date(Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60_000),
		);

		const rolled = await this.rollups.run(before);
		const { removed, complete } = await this.sweepEvents(before);
		const visitors = await this.sweepVisitors(before);
		const counters = await this.counters.sweep();
		const marketing = await this.sweepMarketingEvents(before);

		if (!complete) {
			this.logger.warn({
				message:
					"Tracking retention hit its pass limit — events older than the window remain",
				removed,
				retentionDays: EVENT_RETENTION_DAYS,
			});
		}

		if (!marketing.complete) {
			this.logger.warn({
				message:
					"Marketing retention hit its pass limit — marketing events older than the window remain",
				marketingEvents: marketing.removed,
				retentionDays: EVENT_RETENTION_DAYS,
			});
		}

		this.logger.log({
			message: "Tracking retention swept",
			rolled,
			removed,
			complete,
			visitors,
			counters,
			marketingEvents: marketing.removed,
			marketingEventsComplete: marketing.complete,
			retentionDays: EVENT_RETENTION_DAYS,
		});

		return {
			rolled,
			removed,
			complete,
			visitors,
			counters,
			marketingEvents: marketing.removed,
			marketingEventsComplete: marketing.complete,
		};
	}

	private async sweepMarketingEvents(
		before: Date,
	): Promise<{ removed: number; complete: boolean }> {
		let removed = 0;

		for (let pass = 0; pass < MARKETING.retention.maxPasses; pass += 1) {
			const swept = await sweepEvents(
				this.db,
				before,
				MARKETING.retention.batch,
			);

			removed += swept.removed;
			if (swept.complete) return { removed, complete: true };
		}

		return { removed, complete: false };
	}

	private async sweepEvents(
		before: Date,
	): Promise<{ removed: number; complete: boolean }> {
		let removed = 0;

		for (let pass = 0; pass < MAX_SWEEP_PASSES; pass += 1) {
			const deleted = await this.db.$executeRaw`
				DELETE FROM "trackedEvent"
				WHERE "id" IN (
					SELECT "id" FROM "trackedEvent"
					WHERE "occurredAt" < ${before}
					LIMIT ${SWEEP_BATCH}
				);
			`;

			removed += deleted;
			if (deleted < SWEEP_BATCH) return { removed, complete: true };
		}

		return { removed, complete: false };
	}

	private async sweepVisitors(before: Date): Promise<number> {
		const orphaned = await this.db.$executeRaw`
			DELETE FROM "trackedVisitor"
			WHERE "contactId" IS NULL
				AND "lastSeen" < ${before}
				AND NOT EXISTS (
					SELECT 1 FROM "trackedEvent"
					WHERE "trackedEvent"."visitorId" = "trackedVisitor"."id"
				);
		`;

		return orphaned;
	}
}

async function read(
	request: IncomingMessage,
	limit: number,
): Promise<string | null> {
	const existing = (request as { body?: unknown }).body;
	if (typeof existing === "string") {
		return existing.length > limit ? null : existing;
	}
	if (existing && typeof existing === "object") {
		return JSON.stringify(existing);
	}

	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let settled = false;

		const finish = (value: string | null) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};

		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > limit) {
				request.destroy();
				finish(null);
				return;
			}
			chunks.push(chunk);
		});

		request.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
		request.on("error", () => finish(null));
	});
}

function startOfDay(at: Date): Date {
	const day = new Date(at);
	day.setUTCHours(0, 0, 0, 0);

	return day;
}

function timingSafeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;

	let mismatch = 0;
	for (let index = 0; index < a.length; index += 1) {
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}

	return mismatch === 0;
}
