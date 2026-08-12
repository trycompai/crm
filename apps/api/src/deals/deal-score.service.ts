import { onSignedIn } from "@crm/auth";
import type { Db } from "@crm/db";
import {
	DEAL_SCORE,
	needsDealScore,
	scoreRescoreCutoff,
} from "@crm/db/deal-score";
import { OPEN_DEAL_STAGES } from "@crm/db/deal-stage";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import { DEAL_SCORE_SWEEP } from "./deal-score.config";

export type DealScoreSweepResult = {
	scanned: number;
	queued: number;
	alreadyQueued: number;
};

@Injectable()
export class DealScoreService implements OnModuleInit {
	private readonly logger = new Logger(DealScoreService.name);

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
		if (await this.cache.get(DEAL_SCORE_SWEEP.auto.cacheKey)) {
			return { started: false };
		}
		await this.cache.set(
			DEAL_SCORE_SWEEP.auto.cacheKey,
			true,
			DEAL_SCORE_SWEEP.auto.everyMs,
		);

		void (async () => {
			try {
				const result = await this.sweep();
				if (result.queued > 0 || result.scanned > 0) {
					this.logger.log({
						message: "Deal-score sweep finished",
						...result,
					});
				}
			} catch (error) {
				this.logger.error(
					{ message: "Deal-score sweep failed" },
					error instanceof Error ? error.stack : String(error),
				);
			}
		})();

		return { started: true };
	}

	async sweep(now = new Date()): Promise<DealScoreSweepResult> {
		const cutoff = scoreRescoreCutoff(now);

		const deals = await this.db.deal.findMany({
			where: {
				stage: { in: [...OPEN_DEAL_STAGES] },
				OR: [{ dealScoredAt: null }, { dealScoredAt: { lte: cutoff } }],
			},
			orderBy: [
				{ dealScoredAt: { sort: "asc", nulls: "first" } },
				{ updatedAt: "asc" },
				{ id: "asc" },
			],
			take: DEAL_SCORE.maxPerRun,
			select: {
				id: true,
				name: true,
				dealScoredAt: true,
			},
		});

		let queued = 0;
		let alreadyQueued = 0;

		for (const deal of deals) {
			if (
				!needsDealScore({
					dealScoredAt: deal.dealScoredAt,
					now,
				})
			) {
				continue;
			}

			const reason = deal.dealScoredAt
				? `Nightly rescore for ${deal.name.trim() || "deal"}`
				: `Score open deal ${deal.name.trim() || "deal"}`;
			const created = await this.agent.dealScore(deal.id, reason);
			if (created) queued += 1;
			else alreadyQueued += 1;
		}

		return { scanned: deals.length, queued, alreadyQueued };
	}
}
