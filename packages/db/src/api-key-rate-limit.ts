import type { Db } from "./client";
import type { Prisma } from "./generated/prisma/client";

export type ApiKeyRateLimitPolicy = {
	maxRequests: number;
	timeWindowMs: number;
};

export type ApiKeyRateLimitBackfillResult = {
	updated: number;
	alreadyPolicied: number;
};

const WITHOUT_POLICY: Prisma.ApikeyWhereInput = {
	OR: [{ rateLimitMax: null }, { rateLimitTimeWindow: null }],
};

function isPositiveInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0;
}

export async function backfillApiKeyRateLimit(
	db: Db,
	policy: ApiKeyRateLimitPolicy,
): Promise<ApiKeyRateLimitBackfillResult> {
	if (
		!isPositiveInteger(policy.maxRequests) ||
		!isPositiveInteger(policy.timeWindowMs)
	) {
		throw new RangeError(
			"API key rate-limit policy values must be positive integers.",
		);
	}

	const alreadyPolicied = await db.apikey.count({
		where: { NOT: WITHOUT_POLICY },
	});

	const { count: updated } = await db.apikey.updateMany({
		where: WITHOUT_POLICY,
		data: {
			rateLimitEnabled: true,
			rateLimitMax: policy.maxRequests,
			rateLimitTimeWindow: policy.timeWindowMs,
		},
	});

	return { updated, alreadyPolicied };
}
