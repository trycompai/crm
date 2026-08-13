import type { Db } from "@crm/db";
import {
	advanceDue,
	archiveDrained,
	type ClaimedSend,
	claimDueSends,
	deferQuiet,
	finishCampaigns,
	linkReplies,
	MARKETING,
	pauseUnhealthy,
	readMarketingSettings,
	resendConnection,
	settle,
	skipOverCap,
	startDueCampaigns,
	sweepEntries,
	sweepExits,
} from "@crm/db/marketing";
import { readDocument } from "@crm/email";
import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { FiledSend } from "./marketing-activity.service";
import { MarketingActivityService } from "./marketing-activity.service";
import { MarketingComposeService } from "./marketing-compose.service";

import type { SendOne, SendOutcome } from "./resend.service";
import { ResendService } from "./resend.service";

type ComposedBody = NonNullable<
	Awaited<ReturnType<MarketingComposeService["compose"]>>
>;

@Injectable()
export class MarketingDrainService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(MarketingDrainService.name);
	private timer: ReturnType<typeof setInterval> | null = null;
	private running = false;
	private lastReplyScan = new Date(Date.now() - 10 * 60_000);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly resend: ResendService,
		private readonly compose: MarketingComposeService,
		private readonly activity: MarketingActivityService,
	) {}

	onModuleInit(): void {
		if (process.env.NODE_ENV === "test") return;

		this.timer = setInterval(() => {
			void this.tick().catch((error: unknown) => {
				this.logger.error(
					{ message: "The marketing drain failed" },
					error instanceof Error ? error.stack : undefined,
				);
			});
		}, MARKETING.drain.tickMs);

		this.timer.unref?.();
	}

	onModuleDestroy(): void {
		if (this.timer) clearInterval(this.timer);
	}

	async tick(): Promise<{ sent: number; failed: number; advanced: number }> {
		if (this.running) return { sent: 0, failed: 0, advanced: 0 };
		this.running = true;

		try {
			const since = this.lastReplyScan;
			this.lastReplyScan = new Date();
			await linkReplies(this.db, since);

			const live = await this.db.marketingCampaign.findMany({
				where: { kind: "DRIP", status: { in: ["ACTIVE", "DRAINING"] } },
				select: { id: true, status: true },
			});

			for (const campaign of live) {
				await sweepExits(this.db, campaign.id);
				if (campaign.status === "ACTIVE")
					await sweepEntries(this.db, campaign.id);
			}

			const advanced = await advanceDue(this.db);
			await archiveDrained(this.db);
			await startDueCampaigns(this.db);

			const { sent, failed } = await this.drainSends();

			const paused = await pauseUnhealthy(this.db);
			for (const campaignId of paused) {
				this.logger.warn({
					message: "A campaign paused itself on deliverability",
					campaignId,
				});
			}

			await finishCampaigns(this.db);

			return { sent, failed, advanced };
		} finally {
			this.running = false;
		}
	}

	private async drainSends(): Promise<{ sent: number; failed: number }> {
		const settings = await readMarketingSettings(this.db);
		if (!resendConnection(settings)) return { sent: 0, failed: 0 };

		const perTick = Math.max(
			1,
			Math.round((settings.sendsPerMinute * MARKETING.drain.tickMs) / 60_000),
		);

		const now = new Date();

		await deferQuiet(this.db, {
			start: settings.quietStart,
			end: settings.quietEnd,
			timeZone: settings.timeZone,
			now,
		});

		if (!(await this.resend.ready())) {
			this.logger.warn({
				message:
					"Resend has no usable token, so no marketing send was claimed this tick",
			});
			return { sent: 0, failed: 0 };
		}

		const limit: number = Math.min(perTick, MARKETING.drain.claimLimit);
		const claimed = await skipOverCap(
			this.db,
			await claimDueSends(this.db, limit),
			settings.dailyCap ?? 0,
			now,
		);

		if (claimed.length === 0) return { sent: 0, failed: 0 };

		let sent = 0;
		let failed = 0;

		const filed: FiledSend[] = [];
		const names = new Map<string, string | null>();
		const batchable: { send: ClaimedSend; body: ComposedBody }[] = [];

		const record = async (
			send: ClaimedSend,
			body: ComposedBody,
			outcome: SendOutcome,
		): Promise<void> => {
			await settle(this.db, send.id, outcome);

			if (outcome.ok) {
				sent += 1;
				this.remember(filed, names, send, body);
			} else {
				failed += 1;
			}
		};

		for (const send of claimed) {
			if (!readDocument(send.document)) {
				await settle(this.db, send.id, {
					ok: false,
					error: "This email's content cannot be read, so it cannot be built.",
					retry: false,
				});
				failed += 1;
				continue;
			}

			const context = await this.compose.contextFor(send.contactId);

			let body: ComposedBody | null;

			try {
				body = await this.compose.compose({
					document: send.document,
					subject: send.subject ?? "",
					preheader: send.preheader,
					token: send.token,
					context,
				});
			} catch (error) {
				await settle(this.db, send.id, {
					ok: false,
					error:
						error instanceof Error
							? error.message
							: "This email cannot be built.",
					retry: true,
				});
				failed += 1;
				continue;
			}

			if (!body) {
				await settle(this.db, send.id, {
					ok: false,
					error:
						"This install cannot build the unsubscribe link. Set APP_URL and a postal address.",
					retry: false,
				});
				failed += 1;
				continue;
			}

			if (send.hasAttachments) {
				const outcome = await this.resend.sendOne({
					...this.messageFor(send, body),
					idempotencyKey: `send/${send.id}`,
					attachments: send.attachments.map((attachment) => ({
						filename: attachment.filename,
						path: attachment.url,
					})),
				});

				await record(send, body, outcome);
				continue;
			}

			batchable.push({ send, body });
		}

		for (
			let index = 0;
			index < batchable.length;
			index += MARKETING.send.batchSize
		) {
			const slice = batchable.slice(index, index + MARKETING.send.batchSize);

			const outcomes = await this.resend.sendBatch(
				slice.map(({ send, body }) => ({
					...this.messageFor(send, body),
					sendId: send.id,
				})),
			);

			for (const { send, body } of slice) {
				const outcome = outcomes.get(send.id) ?? {
					ok: false as const,
					error: "Resend did not answer for this message.",
					retry: true,
				};

				await record(send, body, await this.rescue(send, body, outcome));
			}
		}

		await this.fileActivity(filed, names);

		return { sent, failed };
	}

	private messageFor(send: ClaimedSend, body: ComposedBody): SendOne {
		return {
			to: send.address,
			fromName: send.fromName,
			subject: body.subject,
			html: body.html,
			text: body.text,
			replyTo: send.replyTo,
			headers: body.headers,
		};
	}

	private async rescue(
		send: ClaimedSend,
		body: ComposedBody,
		outcome: SendOutcome,
	): Promise<SendOutcome> {
		if (outcome.ok || outcome.retry) return outcome;

		return this.resend.sendOne({
			...this.messageFor(send, body),
			idempotencyKey: `send/${send.id}`,
		});
	}

	private remember(
		filed: FiledSend[],
		names: Map<string, string | null>,
		send: ClaimedSend,
		body: ComposedBody,
	): void {
		if (!send.contactId) return;

		filed.push({
			contactId: send.contactId,
			subject: body.subject,
			campaignName: send.campaignId ?? null,
			sentAt: new Date(),
		});

		if (send.campaignId) names.set(send.campaignId, null);
	}

	private async fileActivity(
		filed: FiledSend[],
		names: Map<string, string | null>,
	): Promise<void> {
		if (filed.length === 0) return;

		try {
			if (names.size > 0) {
				const campaigns = await this.db.marketingCampaign.findMany({
					where: { id: { in: [...names.keys()] } },
					select: { id: true, name: true },
				});

				for (const campaign of campaigns) names.set(campaign.id, campaign.name);
			}

			await this.activity.file(
				filed.map((send) => ({
					...send,
					campaignName: send.campaignName
						? (names.get(send.campaignName) ?? null)
						: null,
				})),
			);
		} catch (error) {
			this.logger.warn({
				message: "A marketing send did not reach the timeline",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
