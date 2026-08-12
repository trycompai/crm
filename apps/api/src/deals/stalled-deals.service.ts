import { onSignedIn } from "@crm/auth";
import type { Db } from "@crm/db";
import { OPEN_DEAL_STAGES } from "@crm/db/deal-stage";
import {
	daysInactive,
	isStalledDeal,
	STALLED_DEAL,
	stallCutoff,
	stallReason,
} from "@crm/db/stalled-deals";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { STALLED_DEALS } from "./stalled-deals.config";

export type StalledDealSweepResult = {
	scanned: number;
	queued: number;
	alreadyQueued: number;
};

@Injectable()
export class StalledDealsService implements OnModuleInit {
	private readonly logger = new Logger(StalledDealsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	onModuleInit(): void {
		onSignedIn(() => {
			void this.auto();
		});
	}

	async auto(): Promise<{ started: boolean }> {
		if (await this.cache.get(STALLED_DEALS.auto.cacheKey)) {
			return { started: false };
		}
		await this.cache.set(
			STALLED_DEALS.auto.cacheKey,
			true,
			STALLED_DEALS.auto.everyMs,
		);

		void (async () => {
			try {
				const result = await this.sweep();
				if (result.queued > 0 || result.scanned > 0) {
					this.logger.log({
						message: "Stalled-deal sweep finished",
						...result,
					});
				}
			} catch (error) {
				this.logger.error(
					{ message: "Stalled-deal sweep failed" },
					error instanceof Error ? error.stack : String(error),
				);
			}
		})();

		return { started: true };
	}

	async sweep(now = new Date()): Promise<StalledDealSweepResult> {
		const cutoff = stallCutoff(now, STALLED_DEAL.inactiveDays);

		const deals = await this.db.deal.findMany({
			where: {
				stage: { in: [...OPEN_DEAL_STAGES] },
				OR: [
					{ lastActivityAt: { lte: cutoff } },
					{ lastActivityAt: null, createdAt: { lte: cutoff } },
				],
			},
			orderBy: [
				{ lastActivityAt: { sort: "asc", nulls: "first" } },
				{ createdAt: "asc" },
				{ id: "asc" },
			],
			take: STALLED_DEAL.maxPerRun,
			select: {
				id: true,
				name: true,
				createdAt: true,
				lastActivityAt: true,
			},
		});

		let queued = 0;
		let alreadyQueued = 0;

		for (const deal of deals) {
			if (
				!isStalledDeal({
					lastActivityAt: deal.lastActivityAt,
					createdAt: deal.createdAt,
					now,
					inactiveDays: STALLED_DEAL.inactiveDays,
				})
			) {
				continue;
			}

			const days = daysInactive({
				lastActivityAt: deal.lastActivityAt,
				createdAt: deal.createdAt,
				now,
			});
			const created = await this.agent.stalledDeal(
				deal.id,
				stallReason(deal.name, days),
			);
			if (created) queued += 1;
			else alreadyQueued += 1;
		}

		return { scanned: deals.length, queued, alreadyQueued };
	}
}
