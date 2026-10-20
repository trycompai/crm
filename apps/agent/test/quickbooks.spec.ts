import { afterEach, describe, expect, it } from "bun:test";
import type { ApprovalContext, ApprovalStatus } from "eve/tools";
import { APP_AUTH } from "../agent/lib/app-auth";
import {
	QuickBooksClient,
	type QuickBooksFetch,
	type QuickBooksGrant,
	type QuickBooksStore,
	quickBooksEstimateInput,
	quickBooksReadInput,
} from "../agent/lib/quickbooks";
import {
	QUICKBOOKS,
	type QuickBooksConfig,
	quickBooksConfig,
	quickBooksEnabled,
} from "../agent/lib/quickbooks-config";
import { quickBooksClient } from "../agent/lib/quickbooks-runtime";
import {
	openQuickBooksTokens,
	sealQuickBooksTokens,
} from "../agent/lib/quickbooks-store";
import createEstimate from "../agent/tools/create_quickbooks_estimate";

const config: QuickBooksConfig = {
	clientId: "test-client",
	clientSecret: "test-secret",
	realmId: "123456",
	environment: "sandbox",
	encryptionKey: "ab".repeat(32),
};
const draft = {
	customerId: "1",
	lines: [{ itemId: "2", amount: 25, description: "Consulting" }],
};
const read = { entity: "customer", id: "1" } as const;
const requestId = "a".repeat(40);
const freshTokens = {
	access_token: "fresh-access",
	refresh_token: "fresh-refresh",
	token_type: "bearer",
	expires_in: 3600,
};

function harness(responses: Response[]) {
	let grant: QuickBooksGrant = {
		realmId: config.realmId,
		environment: config.environment,
		verified: true,
		tokens: { accessToken: "old-access", refreshToken: "old-refresh" },
	};
	const calls: { url: string; init: RequestInit }[] = [];
	const store: QuickBooksStore = {
		read: async () => grant,
		async rotate(accessToken, refresh) {
			if (accessToken === grant.tokens.accessToken)
				grant = { ...grant, tokens: await refresh(grant) };
			return grant;
		},
	};
	const fetcher: QuickBooksFetch = async (url, init) => {
		calls.push({ url, init });
		const response = responses.shift();
		if (!response) throw new Error("Unexpected HTTP call");
		return response;
	};
	return {
		client: new QuickBooksClient(config, store, fetcher),
		calls,
		store,
		fetcher,
		grant: () => grant,
	};
}

describe("QuickBooks refresh", () => {
	it("refreshes once, saves both rotated tokens, and replays the original read once", async () => {
		const h = harness([
			new Response(null, { status: 401 }),
			Response.json(freshTokens),
			Response.json({ Customer: { Id: "1", DisplayName: "Test" } }),
		]);
		expect(await h.client.read(read)).toEqual({ Id: "1", DisplayName: "Test" });
		expect(h.calls).toHaveLength(3);
		expect(h.calls[1]?.url).toBe(QUICKBOOKS.tokenUrl);
		expect(h.calls[1]?.init.body).toBe(
			"grant_type=refresh_token&refresh_token=old-refresh",
		);
		expect(new Headers(h.calls[1]?.init.headers).get("Authorization")).toBe(
			`Basic ${Buffer.from("test-client:test-secret").toString("base64")}`,
		);
		expect(h.calls[2]?.url).toBe(h.calls[0]?.url);
		expect(new Headers(h.calls[2]?.init.headers).get("Authorization")).toBe(
			"Bearer fresh-access",
		);
		expect(h.grant().tokens.refreshToken).toBe("fresh-refresh");
	});

	it("does not refresh on successful reads", async () => {
		const h = harness([Response.json({ Customer: { Id: "1" } })]);
		await h.client.read(read);
		expect(h.calls).toHaveLength(1);
	});

	it("stops after a second 401", async () => {
		const h = harness([
			new Response(null, { status: 401 }),
			Response.json(freshTokens),
			new Response(null, { status: 401 }),
		]);
		await expect(h.client.read(read)).rejects.toThrow("401");
		expect(h.calls).toHaveLength(3);
	});

	for (const status of [400, 401, 500]) {
		it(`fails closed on refresh HTTP ${status} without replaying a draft`, async () => {
			const h = harness([
				new Response(null, { status: 401 }),
				new Response("secret token", { status }),
			]);
			await expect(h.client.createEstimate(draft, requestId)).rejects.toThrow(
				"refresh failed",
			);
			expect(h.calls).toHaveLength(2);
			expect(h.grant().tokens.refreshToken).toBe("old-refresh");
		});
	}

	it("rejects an incomplete token response without replay", async () => {
		const h = harness([
			new Response(null, { status: 401 }),
			Response.json({ access_token: "fresh-access" }),
		]);
		await expect(h.client.createEstimate(draft, requestId)).rejects.toThrow(
			"invalid token response",
		);
		expect(h.calls).toHaveLength(2);
	});

	it("does not replay when persistence fails after refresh", async () => {
		const h = harness([
			new Response(null, { status: 401 }),
			Response.json(freshTokens),
		]);
		h.store.rotate = async (_token, refresh) => {
			await refresh(h.grant());
			throw new Error("database unavailable");
		};
		await expect(h.client.createEstimate(draft, requestId)).rejects.toThrow(
			"database unavailable",
		);
		expect(h.calls).toHaveLength(2);
	});

	it("reuses credentials rotated by another instance", async () => {
		const h = harness([
			new Response(null, { status: 401 }),
			Response.json({ Customer: { Id: "1" } }),
		]);
		h.store.rotate = async () => ({
			...h.grant(),
			tokens: {
				accessToken: "other-instance-access",
				refreshToken: "other-instance-refresh",
			},
		});
		await h.client.read(read);
		expect(h.calls).toHaveLength(2);
		expect(new Headers(h.calls[1]?.init.headers).get("Authorization")).toBe(
			"Bearer other-instance-access",
		);
	});

	for (const status of [403, 429, 500]) {
		it(`does not refresh or replay HTTP ${status}`, async () => {
			const h = harness([new Response(null, { status })]);
			await expect(h.client.read(read)).rejects.toThrow(String(status));
			expect(h.calls).toHaveLength(1);
		});
	}

	it("redacts transport errors and does not retry", async () => {
		const h = harness([]);
		const client = new QuickBooksClient(config, h.store, async () => {
			throw new Error("old-access");
		});
		await expect(client.read(read)).rejects.toThrow("request did not complete");
	});

	it("keeps the draft body and request ID identical across a refresh replay", async () => {
		const h = harness([
			new Response(null, { status: 401 }),
			Response.json(freshTokens),
			Response.json({ Estimate: { Id: "8", TxnStatus: "Pending" } }),
		]);
		await h.client.createEstimate(draft, requestId);
		expect(h.calls[0]?.url).toBe(
			`https://sandbox-quickbooks.api.intuit.com/v3/company/123456/estimate?requestid=${requestId}`,
		);
		expect(h.calls[2]?.url).toBe(h.calls[0]?.url);
		expect(h.calls[2]?.init.body).toBe(h.calls[0]?.init.body);
		expect(h.calls[0]?.init.body).toContain('"TxnStatus":"Pending"');
		expect(h.calls[0]?.init.body).toContain('"EmailStatus":"NotSet"');
		expect(
			h.calls.every(
				(call) => call.init.redirect === "error" && call.init.signal,
			),
		).toBe(true);
	});

	for (const change of [
		{ realmId: "999" },
		{ environment: "production" },
		{ verified: false },
	]) {
		it(`refuses an enrollment mismatch ${JSON.stringify(change)} before HTTP`, async () => {
			const h = harness([]);
			Object.assign(h.grant(), change);
			await expect(h.client.createEstimate(draft, requestId)).rejects.toThrow(
				"enrollment",
			);
			expect(h.calls).toHaveLength(0);
		});
	}

	it("refuses path injection and invalid amounts before HTTP", async () => {
		expect(
			quickBooksReadInput.safeParse({
				entity: "customer",
				id: "../other-realm",
			}).success,
		).toBe(false);
		expect(
			quickBooksEstimateInput.safeParse({
				...draft,
				lines: [{ ...draft.lines[0], amount: -1 }],
			}).success,
		).toBe(false);
	});
});

describe("QuickBooks credentials", () => {
	it("survives process-independent decoding without storing plaintext", () => {
		const tokens = {
			accessToken: "private-access",
			refreshToken: "private-refresh",
		};
		const encrypted = sealQuickBooksTokens(tokens, config);
		expect(encrypted).not.toContain("private");
		expect(openQuickBooksTokens(encrypted, config)).toEqual(tokens);
		expect(sealQuickBooksTokens(tokens, config)).not.toBe(encrypted);
	});

	it("rejects another realm, environment, or encryption key", () => {
		const encrypted = sealQuickBooksTokens(
			{ accessToken: "access", refreshToken: "refresh" },
			config,
		);
		for (const changed of [
			{ ...config, realmId: "999" },
			{ ...config, environment: "production" as const },
			{ ...config, encryptionKey: "cd".repeat(32) },
		]) {
			expect(() => openQuickBooksTokens(encrypted, changed)).toThrow(
				"credentials cannot be read",
			);
		}
	});
});

describe("QuickBooks approval", () => {
	const policy = createEstimate.approval as (
		context: ApprovalContext,
	) => ApprovalStatus | Promise<ApprovalStatus>;
	it("requires approval for every call, including previously approved tools", async () => {
		const context = {
			session: {
				auth: {
					current: {
						authenticator: "crm-app",
						principalType: "user",
						principalId: "owner",
					},
				},
			},
			approvedTools: new Set(["create_quickbooks_estimate"]),
		} as unknown as ApprovalContext;
		expect(await policy(context)).toBe("user-approval");
		expect(await policy(context)).toBe("user-approval");
	});
	it("denies unattended app-principal draft creation", async () => {
		const context = {
			session: { auth: { current: APP_AUTH } },
		} as unknown as ApprovalContext;
		expect(await policy(context)).toMatchObject({ type: "denied" });
	});
});

describe("QuickBooks deployment gate", () => {
	const saved = process.env.QUICKBOOKS_ENABLED;
	afterEach(() => {
		if (saved === undefined) delete process.env.QUICKBOOKS_ENABLED;
		else process.env.QUICKBOOKS_ENABLED = saved;
	});
	it("is disabled without explicit opt-in and does not load the database", async () => {
		delete process.env.QUICKBOOKS_ENABLED;
		expect(quickBooksEnabled()).toBe(false);
		expect(await quickBooksClient()).toBeNull();
	});
	it("fails closed with missing credentials even when enabled", () => {
		process.env.QUICKBOOKS_ENABLED = "true";
		expect(quickBooksConfig()).toBeNull();
		expect(quickBooksEnabled()).toBe(false);
	});
});
