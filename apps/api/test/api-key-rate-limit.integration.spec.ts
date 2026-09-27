import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { backfillApiKeyRateLimit } from "@crm/db/api-key-rate-limit";
import {
	type RateLimitedAuth,
	rateLimitedAuth,
} from "./support/rate-limited-auth";

const suffix = process.env.TEST_RUN_ID ?? "api-key-rate-limit-spec";
const userId = `user-${suffix}`;

async function issueKey(
	auth: RateLimitedAuth,
	name: string,
): Promise<{ id: string; key: string }> {
	const created = await auth.api.createApiKey({
		body: { userId, name },
	});

	return { id: created.id, key: created.key };
}

function headersWithKey(key: string): Headers {
	return new Headers({ "x-api-key": key });
}

async function deniedStatus(
	auth: RateLimitedAuth,
	key: string,
): Promise<string | undefined> {
	try {
		await auth.api.getSession({ headers: headersWithKey(key) });
		return undefined;
	} catch (error) {
		return (error as { status?: string }).status;
	}
}

beforeAll(async () => {
	await db.apikey.deleteMany({ where: { referenceId: userId } });
	await db.user.deleteMany({ where: { id: userId } });
	await db.user.create({
		data: {
			id: userId,
			name: "Rate Limit Test",
			email: `${userId}@example.test`,
		},
	});
});

afterAll(async () => {
	await db.apikey.deleteMany({ where: { referenceId: userId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("apiKey plugin rate limiting (isolated test instance, crm_test only)", () => {
	it("allows requests at or under the limit", async () => {
		const auth = rateLimitedAuth({ maxRequests: 3, timeWindowMs: 60_000 });
		const { key } = await issueKey(auth, "under-limit");

		for (let attempt = 0; attempt < 3; attempt += 1) {
			const session = await auth.api.getSession({
				headers: headersWithKey(key),
			});
			expect(session?.user.id).toBe(userId);
		}
	});

	it("denies the request that exceeds the limit with TOO_MANY_REQUESTS", async () => {
		const auth = rateLimitedAuth({ maxRequests: 2, timeWindowMs: 60_000 });
		const { key } = await issueKey(auth, "over-limit");

		await auth.api.getSession({ headers: headersWithKey(key) });
		await auth.api.getSession({ headers: headersWithKey(key) });

		const status = await deniedStatus(auth, key);
		expect(status).toBe("TOO_MANY_REQUESTS");
	});

	it("carries a positive tryAgainIn on the rejection", async () => {
		const auth = rateLimitedAuth({ maxRequests: 1, timeWindowMs: 60_000 });
		const { key } = await issueKey(auth, "retry-after");

		await auth.api.getSession({ headers: headersWithKey(key) });

		const error = await auth.api
			.getSession({ headers: headersWithKey(key) })
			.then(
				() => null,
				(error) => error as { body?: { details?: { tryAgainIn?: number } } },
			);
		expect(error).not.toBeNull();
		expect(error?.body?.details?.tryAgainIn).toBeGreaterThan(0);
	});

	it("never lets the stored counter exceed the limit under concurrency", async () => {
		const maxRequests = 5;
		const auth = rateLimitedAuth({ maxRequests, timeWindowMs: 60_000 });
		const { id, key } = await issueKey(auth, "concurrency");

		const attempts = 10;
		const results = await Promise.allSettled(
			Array.from({ length: attempts }, () =>
				auth.api.getSession({ headers: headersWithKey(key) }),
			),
		);

		const succeeded = results.filter((r) => r.status === "fulfilled").length;
		const denied = results.filter(
			(r) =>
				r.status === "rejected" &&
				(r.reason as { status?: string })?.status === "TOO_MANY_REQUESTS",
		).length;

		expect(succeeded).toBeLessThanOrEqual(maxRequests);
		expect(succeeded + denied).toBe(attempts);

		const row = await db.apikey.findUniqueOrThrow({
			where: { id },
			select: { requestCount: true },
		});
		expect(row.requestCount ?? 0).toBeLessThanOrEqual(maxRequests);
	}, 15_000);
});

describe("backfillApiKeyRateLimit (crm_test only, never run against crm)", () => {
	it("applies the policy only to keys with no policy yet", async () => {
		const auth = rateLimitedAuth({ maxRequests: 10, timeWindowMs: 60_000 });
		const legacy = await issueKey(auth, "legacy-no-policy");

		await db.apikey.update({
			where: { id: legacy.id },
			data: {
				rateLimitEnabled: false,
				rateLimitMax: null,
				rateLimitTimeWindow: null,
			},
		});

		const before = await db.apikey.findUniqueOrThrow({
			where: { id: legacy.id },
			select: { rateLimitEnabled: true, rateLimitMax: true },
		});
		expect(before.rateLimitEnabled).toBe(false);
		expect(before.rateLimitMax).toBeNull();

		const first = await backfillApiKeyRateLimit(db, {
			maxRequests: 7,
			timeWindowMs: 3_600_000,
		});
		expect(first.updated).toBeGreaterThanOrEqual(1);

		const after = await db.apikey.findUniqueOrThrow({
			where: { id: legacy.id },
			select: {
				rateLimitEnabled: true,
				rateLimitMax: true,
				rateLimitTimeWindow: true,
			},
		});
		expect(after.rateLimitEnabled).toBe(true);
		expect(after.rateLimitMax).toBe(7);
		expect(after.rateLimitTimeWindow).toBe(3_600_000);

		const second = await backfillApiKeyRateLimit(db, {
			maxRequests: 999,
			timeWindowMs: 1,
		});
		expect(second.alreadyPolicied).toBeGreaterThan(0);

		const unchanged = await db.apikey.findUniqueOrThrow({
			where: { id: legacy.id },
			select: { rateLimitMax: true },
		});
		expect(unchanged.rateLimitMax).toBe(7);
	});

	it("rejects invalid policies before writing any keys", async () => {
		await expect(
			backfillApiKeyRateLimit(db, { maxRequests: 0, timeWindowMs: 1 }),
		).rejects.toThrow(RangeError);
		await expect(
			backfillApiKeyRateLimit(db, { maxRequests: 1, timeWindowMs: -1 }),
		).rejects.toThrow(RangeError);
	});

	it("leaves an already-policied key's limit untouched", async () => {
		const auth = rateLimitedAuth({ maxRequests: 4, timeWindowMs: 5_000 });
		const configured = await issueKey(auth, "already-policied");

		const result = await backfillApiKeyRateLimit(db, {
			maxRequests: 999,
			timeWindowMs: 1,
		});
		expect(result.updated).toBe(0);

		const row = await db.apikey.findUniqueOrThrow({
			where: { id: configured.id },
			select: { rateLimitMax: true, rateLimitTimeWindow: true },
		});
		expect(row.rateLimitMax).toBe(4);
		expect(row.rateLimitTimeWindow).toBe(5_000);
	});
});
