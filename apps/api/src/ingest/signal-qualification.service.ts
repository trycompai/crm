import { randomUUID } from "node:crypto";
import type { Db } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import { DealsService } from "../deals/deals.service";
import type {
	PromoteSignalInput,
	PromoteSignalOutput,
	QualifySignalInput,
	QualifySignalOutput,
	SignalClassification,
	SignalScoreComponents,
} from "./ingest.contracts";
import {
	type SignalPayload,
	type SignalPayloadValue,
	signalPayload,
} from "./ingest.contracts";
import { OpportunityOpsService } from "./opportunity-ops.service";

type SignalRow = {
	id: string;
	businessUnitId: string;
	sourceSystem: string;
	sourceType: string;
	sourceId: string;
	payload: SignalPayload;
};

type CompanyMapping = {
	canonicalId: string;
	applicationId: string | null;
};

type OpportunityMapping = {
	canonicalId: string;
	applicationId: string | null;
};

@Injectable()
export class SignalQualificationService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly deals: DealsService,
		private readonly opportunityOps: OpportunityOpsService,
	) {}

	async qualify(input: QualifySignalInput): Promise<QualifySignalOutput> {
		const signal = await this.loadSignal(input.sourceRecordId);
		const scored = this.score(signal.payload, input.components);
		const company = await this.companyMapping(signal);

		const qualification = {
			score: scored.score,
			classification: scored.classification,
			method: scored.method,
			components: input.components ?? null,
			evidence: input.evidence,
			notes: input.notes ?? null,
			qualified_at: new Date().toISOString(),
		};

		await this.db.$queryRaw`
			UPDATE source_record
			SET payload = payload || ${JSON.stringify({
				signal_score: scored.score,
				qualification,
			})}::jsonb
			WHERE id = ${signal.id}
		`;

		return {
			sourceRecordId: signal.id,
			score: scored.score,
			classification: scored.classification,
			method: scored.method,
			companyResolved: Boolean(company?.applicationId),
			canonicalOpportunityEligible: scored.score >= 70 && Boolean(company),
			visibleDealEligible:
				scored.score >= 85 && Boolean(company?.applicationId),
		};
	}

	async promote(input: PromoteSignalInput): Promise<PromoteSignalOutput> {
		const signal = await this.loadSignal(input.sourceRecordId);
		const isOpportunityOps =
			this.text(signal.payload.workflow) === "opportunity-ops" ||
			this.text(signal.payload.pipeline) === "opportunity-ops";
		const approvedReview = isOpportunityOps
			? await this.opportunityOps.assertApproved(signal.id)
			: null;
		const legacyScore = this.score(signal.payload);
		const score = approvedReview?.score ?? legacyScore.score;
		const classification = this.classification(score);

		if (isOpportunityOps) {
			if (
				approvedReview?.recommendation !== "pursue" &&
				approvedReview?.recommendation !== "qualify"
			) {
				throw new BadRequestException(
					"Only approved Opportunity Ops reviews recommended as pursue or qualify may be promoted.",
				);
			}
		} else if (score < 70) {
			throw new BadRequestException(
				`Signal score ${score} is below the canonical opportunity threshold of 70.`,
			);
		}

		const company = await this.companyMapping(signal);
		if (!company) {
			throw new BadRequestException(
				"Resolve the signal to a company before promoting it.",
			);
		}

		const payload = signal.payload;
		const name =
			this.text(payload.subject) ??
			this.text(payload.message) ??
			"Qualified opportunity";
		const amount = input.amountUsd ?? this.number(payload.estimated_value_usd);
		const stage = isOpportunityOps
			? approvedReview?.recommendation === "pursue"
				? "priority"
				: "qualified"
			: score >= 85
				? "priority"
				: "qualified";

		let createdCanonicalOpportunity = false;
		let canonicalOpportunityId: string;
		const existing = await this.opportunityMapping(signal);
		if (existing) {
			canonicalOpportunityId = existing.canonicalId;
			await this.db.$queryRaw`
				UPDATE canonical_opportunity
				SET "companyId" = ${company.canonicalId},
					name = ${name}, stage = ${stage}, amount = ${amount},
					fields = COALESCE(fields, '{}'::jsonb) || ${JSON.stringify({
						source_signal_id: signal.id,
						signal_score: score,
						classification,
						workflow: isOpportunityOps ? "opportunity-ops" : undefined,
						recommendation: approvedReview?.recommendation ?? undefined,
					})}::jsonb,
					"updatedAt" = CURRENT_TIMESTAMP
				WHERE id = ${canonicalOpportunityId}
			`;
		} else {
			canonicalOpportunityId = randomUUID();
			await this.db.$queryRaw`
				INSERT INTO canonical_opportunity (
					id, "businessUnitId", "companyId", "pipelineId", name, stage,
					amount, fields, "createdAt", "updatedAt"
				)
				VALUES (
					${canonicalOpportunityId}, ${signal.businessUnitId}, ${company.canonicalId},
					NULL, ${name}, ${stage}, ${amount}, ${JSON.stringify({
						source_signal_id: signal.id,
						signal_score: score,
						classification,
						workflow: isOpportunityOps ? "opportunity-ops" : undefined,
						recommendation: approvedReview?.recommendation ?? undefined,
					})}::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
				)
			`;
			createdCanonicalOpportunity = true;
		}

		let dealId = existing?.applicationId ?? null;
		let createdDeal = false;
		if (input.createDeal) {
			if (
				isOpportunityOps
					? approvedReview?.recommendation !== "pursue"
					: score < 85
			) {
				throw new BadRequestException(
					isOpportunityOps
						? "A visible deal requires an approved Opportunity Ops pursue recommendation."
						: `Signal score ${score} is below the visible deal threshold of 85.`,
				);
			}
			if (!company.applicationId) {
				throw new BadRequestException(
					"The resolved company is not linked to a visible Comp company.",
				);
			}
			if (!dealId) {
				if (!input.ownerId) {
					throw new BadRequestException(
						"ownerId is required when creating a visible deal.",
					);
				}
				const deal = await this.deals.create({
					name,
					companyId: company.applicationId,
					ownerId: input.ownerId,
					stage: "DEMO_BOOKED",
					amountCents: amount == null ? null : Math.round(amount * 100),
					currency: "USD",
				});
				dealId = deal.id;
				createdDeal = true;
				await this.db.$queryRaw`
					UPDATE deal SET "businessUnitId" = ${signal.businessUnitId}
					WHERE id = ${deal.id}
				`;
			}
		}

		await this.db.$queryRaw`
			INSERT INTO record_mapping (
				id, "sourceSystem", "sourceType", "sourceId", "canonicalType", "canonicalId",
				application, "applicationId", "matchMethod", status, "createdAt", "updatedAt"
			)
			VALUES (
				${randomUUID()}, ${signal.sourceSystem}, ${signal.sourceType}, ${signal.sourceId},
				'opportunity', ${canonicalOpportunityId}, 'comp-ai-crm', ${dealId},
				${isOpportunityOps ? "human-approved-opportunity-review" : "signal-score"},
				'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
			)
			ON CONFLICT ("sourceSystem", "sourceType", "sourceId", "canonicalType") DO UPDATE SET
				"canonicalId" = EXCLUDED."canonicalId",
				application = EXCLUDED.application,
				"applicationId" = COALESCE(EXCLUDED."applicationId", record_mapping."applicationId"),
				"matchMethod" = EXCLUDED."matchMethod", status = 'active',
				"updatedAt" = CURRENT_TIMESTAMP
		`;

		if (isOpportunityOps && approvedReview) {
			await this.opportunityOps.recordPromotion({
				sourceRecordId: signal.id,
				canonicalOpportunityId,
				approvedReview,
			});
		}

		return {
			sourceRecordId: signal.id,
			score,
			classification,
			canonicalOpportunityId,
			dealId,
			createdCanonicalOpportunity,
			createdDeal,
		};
	}

	private score(payload: SignalPayload, components?: SignalScoreComponents) {
		if (components) {
			const score = Math.round(
				components.icpMatch +
					components.commercialTrigger +
					components.projectRelevance +
					components.companyValue +
					components.location +
					components.decisionMaker +
					components.recency,
			);
			return {
				score,
				classification: this.classification(score),
				method: "components" as const,
			};
		}
		const explicit = this.number(payload.signal_score);
		const metadata = this.object(payload.metadata);
		const legacy = explicit ?? this.number(metadata?.fit_score);
		if (legacy != null) {
			const score = Math.max(0, Math.min(100, Math.round(legacy)));
			return {
				score,
				classification: this.classification(score),
				method: "legacy-score" as const,
			};
		}
		return {
			score: 0,
			classification: "signal" as const,
			method: "unscored" as const,
		};
	}

	private classification(score: number): SignalClassification {
		if (score >= 85) return "priority";
		if (score >= 70) return "qualified";
		if (score >= 50) return "research";
		return "signal";
	}

	private async loadSignal(id: string): Promise<SignalRow> {
		const [row] = await this.db.$queryRaw<SignalRow[]>`
			SELECT id, "businessUnitId" AS "businessUnitId", "sourceSystem" AS "sourceSystem",
				"sourceType" AS "sourceType", "sourceId" AS "sourceId", payload
			FROM source_record WHERE id = ${id} LIMIT 1
		`;
		if (!row) throw new NotFoundException(`No source signal with id ${id}.`);
		return { ...row, payload: signalPayload.parse(row.payload) };
	}

	private async companyMapping(
		signal: SignalRow,
	): Promise<CompanyMapping | null> {
		const [row] = await this.db.$queryRaw<CompanyMapping[]>`
			SELECT "canonicalId" AS "canonicalId", "applicationId" AS "applicationId"
			FROM record_mapping
			WHERE "sourceSystem" = ${signal.sourceSystem} AND "sourceType" = ${signal.sourceType}
				AND "sourceId" = ${signal.sourceId} AND "canonicalType" = 'company'
				AND status = 'active' LIMIT 1
		`;
		return row ?? null;
	}

	private async opportunityMapping(
		signal: SignalRow,
	): Promise<OpportunityMapping | null> {
		const [row] = await this.db.$queryRaw<OpportunityMapping[]>`
			SELECT "canonicalId" AS "canonicalId", "applicationId" AS "applicationId"
			FROM record_mapping
			WHERE "sourceSystem" = ${signal.sourceSystem} AND "sourceType" = ${signal.sourceType}
				AND "sourceId" = ${signal.sourceId} AND "canonicalType" = 'opportunity'
				AND status = 'active' LIMIT 1
		`;
		return row ?? null;
	}

	private object(value: SignalPayloadValue | undefined): SignalPayload | null {
		const parsed = signalPayload.safeParse(value);
		return parsed.success ? parsed.data : null;
	}

	private text(value: SignalPayloadValue | undefined): string | null {
		const parsed = z.string().trim().min(1).safeParse(value);
		return parsed.success ? parsed.data : null;
	}

	private number(value: SignalPayloadValue | undefined): number | null {
		const numeric = z.number().finite().safeParse(value);
		if (numeric.success) return numeric.data;
		const text = z.string().trim().min(1).safeParse(value);
		if (!text.success) return null;
		const parsed = Number(text.data);
		return Number.isFinite(parsed) ? parsed : null;
	}
}
