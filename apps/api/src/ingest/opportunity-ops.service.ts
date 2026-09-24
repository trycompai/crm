import { createHash, randomUUID } from "node:crypto";
import type { Db } from "@crm/db";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	DecideOpportunityInput,
	DecideOpportunityOutput,
	EvaluateOpportunityInput,
	EvaluateOpportunityOutput,
	OpportunityRecommendation,
	OpportunityReviewQueueInput,
	OpportunityReviewQueueOutput,
	OpportunityScoreComponents,
} from "./opportunity-ops.contracts";

type SourceRow = {
	id: string;
	businessUnitId: string;
	payload: Record<string, unknown> | null;
};

type LatestReviewRow = {
	score: number | null;
	recommendation: OpportunityRecommendation | null;
	state: string;
	reviewerUserId: string | null;
};

type ApprovedReviewRow = LatestReviewRow & {
	state: "approved";
};

type QueueRow = {
	sourceRecordId: string;
	businessUnitKey: string;
	businessUnitName: string;
	sourceSystem: string;
	sourceType: string;
	sourceId: string;
	sourceUrl: string | null;
	companyName: string | null;
	opportunityId: string | null;
	opportunityName: string | null;
	reviewState: "pending" | "approved" | "rejected" | "watch" | "promoted";
	recommendation: OpportunityRecommendation | null;
	score: number | null;
	rationale: string | null;
	reviewerUserId: string | null;
	decidedAt: Date | null;
	visibleDealId: string | null;
};

@Injectable()
export class OpportunityOpsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async evaluate(
		input: EvaluateOpportunityInput,
	): Promise<EvaluateOpportunityOutput> {
		const source = await this.loadSource(input.sourceRecordId);
		const score = this.score(input.components);
		const hardBlocked = input.hardBlockers.length > 0;
		const recommendation = hardBlocked ? "pass" : this.recommendation(score);
		const reviewEventId = randomUUID();
		const scoreBreakdown = {
			...input.components,
			evidence: input.evidence,
			hardBlockers: input.hardBlockers,
		};
		const immutableHash = this.hash({
			reviewEventId,
			sourceRecordId: source.id,
			score,
			recommendation,
			scoreBreakdown,
			rationale: input.rationale ?? null,
		});

		await this.db.$transaction(async (tx) => {
			await tx.$queryRaw`
				UPDATE source_record
				SET payload = COALESCE(payload, '{}'::jsonb) || ${JSON.stringify({
					workflow: "opportunity-ops",
					opportunity_ops: {
						score,
						recommendation,
						hard_blockers: input.hardBlockers,
						evaluated_at: new Date().toISOString(),
					},
				})}::jsonb
				WHERE id = ${source.id}
			`;
			await tx.$queryRaw`
				INSERT INTO opportunity_review_event (
					id, "opportunityId", "sourceRecordId", "businessUnitId", "eventType",
					state, recommendation, score, "scoreBreakdown", rationale,
					"reviewerUserId", "decidedAt", "immutableHash", "createdAt"
				) VALUES (
					${reviewEventId}, NULL, ${source.id}, ${source.businessUnitId}, 'evaluation',
					'pending', ${recommendation}, ${score}, ${JSON.stringify(scoreBreakdown)}::jsonb,
					${input.rationale ?? null}, NULL, NULL, ${immutableHash}, CURRENT_TIMESTAMP
				)
			`;
		});

		return {
			sourceRecordId: source.id,
			reviewEventId,
			score,
			recommendation,
			state: "pending",
			hardBlocked,
		};
	}

	async decide(
		input: DecideOpportunityInput,
	): Promise<DecideOpportunityOutput> {
		const source = await this.loadSource(input.sourceRecordId);
		const userExists = await this.db.$queryRaw<Array<{ id: string }>>`
			SELECT id FROM "user" WHERE id = ${input.reviewerUserId} LIMIT 1
		`;
		if (!userExists[0]) {
			throw new BadRequestException("reviewerUserId does not identify a CRM user.");
		}
		const latest = await this.latestReview(source.id);
		if (!latest) {
			throw new BadRequestException(
				"Evaluate the opportunity before recording a review decision.",
			);
		}
		const recommendation = input.recommendation ?? latest.recommendation;
		const reviewEventId = randomUUID();
		const decidedAt = new Date();
		const immutableHash = this.hash({
			reviewEventId,
			sourceRecordId: source.id,
			decision: input.decision,
			recommendation,
			score: latest.score,
			reviewerUserId: input.reviewerUserId,
			rationale: input.rationale,
			decidedAt: decidedAt.toISOString(),
		});

		await this.db.$queryRaw`
			INSERT INTO opportunity_review_event (
				id, "opportunityId", "sourceRecordId", "businessUnitId", "eventType",
				state, recommendation, score, "scoreBreakdown", rationale,
				"reviewerUserId", "decidedAt", "immutableHash", "createdAt"
			) VALUES (
				${reviewEventId}, NULL, ${source.id}, ${source.businessUnitId}, 'decision',
				${input.decision}, ${recommendation}, ${latest.score}, NULL, ${input.rationale},
				${input.reviewerUserId}, ${decidedAt}, ${immutableHash}, CURRENT_TIMESTAMP
			)
		`;

		return {
			sourceRecordId: source.id,
			reviewEventId,
			state: input.decision,
			recommendation,
			score: latest.score,
		};
	}

	async queue(
		input: OpportunityReviewQueueInput,
	): Promise<OpportunityReviewQueueOutput> {
		const rows = await this.db.$queryRaw<QueueRow[]>`
			SELECT
				q."sourceRecordId", q."businessUnitKey", q."businessUnitName",
				q."sourceSystem", q."sourceType", q."sourceId", q."sourceUrl",
				q."companyName", q."opportunityId", q."opportunityName",
				q."reviewState", q.recommendation, q.score, q.rationale,
				q."reviewerUserId", q."decidedAt", q."visibleDealId"
			FROM opportunity_ops_review_queue q
			WHERE (${input.project ?? null}::text IS NULL OR q."businessUnitKey" = ${input.project ?? null})
				AND (${input.state} = 'all' OR q."reviewState" = ${input.state})
				AND (${input.minScore ?? null}::int IS NULL OR COALESCE(q.score, 0) >= ${input.minScore ?? null})
			ORDER BY COALESCE(q.score, 0) DESC, COALESCE(q."observedAt", q."reviewedAt") DESC NULLS LAST
			LIMIT ${input.limit}
		`;
		return {
			rows: rows.map((row) => ({
				...row,
				decidedAt: row.decidedAt?.toISOString() ?? null,
			})),
			count: rows.length,
		};
	}

	async assertApproved(sourceRecordId: string): Promise<ApprovedReviewRow> {
		const [row] = await this.db.$queryRaw<LatestReviewRow[]>`
			SELECT score, recommendation, state, "reviewerUserId" AS "reviewerUserId"
			FROM opportunity_review_event
			WHERE "sourceRecordId" = ${sourceRecordId} AND "eventType" = 'decision'
			ORDER BY "createdAt" DESC, id DESC
			LIMIT 1
		`;
		if (!row || row.state !== "approved") {
			throw new BadRequestException(
				"Opportunity promotion requires the latest human review decision to be approved.",
			);
		}
		return { ...row, state: "approved" };
	}

	async recordPromotion(input: {
		sourceRecordId: string;
		canonicalOpportunityId: string;
		approvedReview: ApprovedReviewRow;
	}) {
		const source = await this.loadSource(input.sourceRecordId);
		const reviewEventId = randomUUID();
		const decidedAt = new Date();
		const immutableHash = this.hash({
			reviewEventId,
			sourceRecordId: source.id,
			canonicalOpportunityId: input.canonicalOpportunityId,
			score: input.approvedReview.score,
			recommendation: input.approvedReview.recommendation,
			reviewerUserId: input.approvedReview.reviewerUserId,
			decidedAt: decidedAt.toISOString(),
		});
		await this.db.$queryRaw`
			INSERT INTO opportunity_review_event (
				id, "opportunityId", "sourceRecordId", "businessUnitId", "eventType",
				state, recommendation, score, "scoreBreakdown", rationale,
				"reviewerUserId", "decidedAt", "immutableHash", "createdAt"
			) VALUES (
				${reviewEventId}, ${input.canonicalOpportunityId}, ${source.id}, ${source.businessUnitId},
				'promotion', 'promoted', ${input.approvedReview.recommendation}, ${input.approvedReview.score},
				NULL, 'Approved opportunity promoted into canonical CRM opportunity.',
				${input.approvedReview.reviewerUserId}, ${decidedAt}, ${immutableHash}, CURRENT_TIMESTAMP
			)
		`;
	}

	private score(components: OpportunityScoreComponents) {
		return Math.round(
			components.capabilityFit +
				components.activeNeed +
				components.commercialValue +
				components.timingUrgency +
				components.buyerAccess +
				components.strategicValue,
		);
	}

	private recommendation(score: number): OpportunityRecommendation {
		if (score >= 80) return "pursue";
		if (score >= 65) return "qualify";
		if (score >= 50) return "watch";
		return "pass";
	}

	private async loadSource(id: string): Promise<SourceRow> {
		const [row] = await this.db.$queryRaw<SourceRow[]>`
			SELECT id, "businessUnitId" AS "businessUnitId", payload
			FROM source_record WHERE id = ${id} LIMIT 1
		`;
		if (!row) throw new NotFoundException(`No source signal with id ${id}.`);
		return row;
	}

	private async latestReview(sourceRecordId: string) {
		const [row] = await this.db.$queryRaw<LatestReviewRow[]>`
			SELECT score, recommendation, state, "reviewerUserId" AS "reviewerUserId"
			FROM opportunity_review_event
			WHERE "sourceRecordId" = ${sourceRecordId}
			ORDER BY "createdAt" DESC, id DESC
			LIMIT 1
		`;
		return row ?? null;
	}

	private hash(value: unknown) {
		return createHash("sha256").update(JSON.stringify(value)).digest("hex");
	}
}
