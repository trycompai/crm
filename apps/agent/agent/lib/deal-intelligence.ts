import { db } from "@crm/db";
import {
	blankToNull,
	clampDealScore,
	DEAL_SCORE,
	isValidDealScore,
} from "@crm/db/deal-score";

export type WriteDealIntelligenceInput = {
	dealId: string;
	score: number;
	summary: string;
	forecastContext: string;
};

export type WriteDealIntelligenceResult =
	| {
			written: true;
			score: number;
			scoredAt: string;
	  }
	| {
			written: false;
			reason: string;
	  };

export async function writeDealIntelligence(
	input: WriteDealIntelligenceInput,
): Promise<WriteDealIntelligenceResult> {
	const score = clampDealScore(input.score);
	if (!isValidDealScore(score)) {
		return {
			written: false,
			reason: `Score must be an integer from ${DEAL_SCORE.min} to ${DEAL_SCORE.max}.`,
		};
	}

	const summary = blankToNull(input.summary);
	if (!summary) {
		return {
			written: false,
			reason: "Score summary is required.",
		};
	}
	if (summary.length > DEAL_SCORE.summaryMax) {
		return {
			written: false,
			reason: `Score summary must be at most ${DEAL_SCORE.summaryMax} characters.`,
		};
	}

	const forecastContext = blankToNull(input.forecastContext);
	if (!forecastContext) {
		return {
			written: false,
			reason: "Forecast context is required.",
		};
	}
	if (forecastContext.length > DEAL_SCORE.forecastMax) {
		return {
			written: false,
			reason: `Forecast context must be at most ${DEAL_SCORE.forecastMax} characters.`,
		};
	}

	const deal = await db.deal.findUnique({
		where: { id: input.dealId },
		select: { id: true },
	});
	if (!deal) {
		return { written: false, reason: "No such deal." };
	}

	const scoredAt = new Date();
	await db.deal.update({
		where: { id: input.dealId },
		data: {
			dealScore: score,
			dealScoreSummary: summary,
			dealScoredAt: scoredAt,
			forecastContext,
		},
	});

	return {
		written: true,
		score,
		scoredAt: scoredAt.toISOString(),
	};
}
