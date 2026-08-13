import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import {
	type MarketingSettings,
	RESEND_OAUTH,
	readMarketingSettings,
	resendConnection,
	writeMarketingSettings,
} from "@crm/db/marketing";
import { ResendOauthService } from "../src/marketing/resend-oauth.service";

const oauth = new ResendOauthService(db);
const realFetch = globalThis.fetch;

type Call = { url: string; body: string };

let calls: Call[] = [];
let saved: MarketingSettings;

function reply(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function stub(
	handler: (url: string, body: string) => Response | Promise<Response>,
): void {
	globalThis.fetch = (async (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	) => {
		const url = typeof input === "string" ? input : input.toString();
		const body = typeof init?.body === "string" ? init.body : "";
		calls.push({ url, body });
		return handler(url, body);
	}) as typeof fetch;
}

function stateOf(url: string): string {
	return new URL(url).searchParams.get("state") ?? "";
}

async function blank(): Promise<void> {
	await writeMarketingSettings(db, {
		resendApiKey: null,
		resendClientId: null,
		resendClientSecret: null,
		resendAccessToken: null,
		resendRefreshToken: null,
		resendTokenExpires: null,
	});
	await db.marketingResendAuthAttempt.deleteMany({});
}

beforeAll(async () => {
	saved = await readMarketingSettings(db);
});

beforeEach(async () => {
	calls = [];
	await blank();
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

afterAll(async () => {
	await db.marketingResendAuthAttempt.deleteMany({});
	await writeMarketingSettings(db, {
		resendApiKey: saved.resendApiKey,
		resendClientId: saved.resendClientId,
		resendClientSecret: saved.resendClientSecret,
		resendAccessToken: saved.resendAccessToken,
		resendRefreshToken: saved.resendRefreshToken,
		resendTokenExpires: saved.resendTokenExpires,
	});
});

describe("connecting Resend with OAuth", () => {
	it("registers once, then reuses the client id", async () => {
		stub((url) =>
			url === RESEND_OAUTH.register
				? reply(200, { client_id: "client-1" })
				: reply(404, {}),
		);

		await oauth.start();
		await oauth.start();

		const registrations = calls.filter(
			(call) => call.url === RESEND_OAUTH.register,
		);

		expect(registrations).toHaveLength(1);
		expect((await readMarketingSettings(db)).resendClientId).toBe("client-1");
	});

	it("sends a PKCE challenge and keeps the verifier off the wire", async () => {
		stub(() => reply(200, { client_id: "client-1" }));

		const { url } = await oauth.start();
		const query = new URL(url).searchParams;
		const attempt = await db.marketingResendAuthAttempt.findUniqueOrThrow({
			where: { state: stateOf(url) },
		});

		expect(url.startsWith(RESEND_OAUTH.authorize)).toBe(true);
		expect(query.get("code_challenge_method")).toBe("S256");
		expect(query.get("code_challenge")).not.toBe(attempt.verifier);
		expect(url).not.toContain(attempt.verifier);
	});

	it("refuses a callback for a sign-in that was not started here", async () => {
		stub(() => reply(200, { client_id: "client-1" }));
		await oauth.start();

		await expect(oauth.finish("code-1", "not-the-state")).rejects.toThrow(
			/was not started here/,
		);

		expect(await db.marketingResendAuthAttempt.count()).toBe(1);
	});

	it("exchanges the code with the verifier and stores the grant", async () => {
		stub((url) =>
			url === RESEND_OAUTH.register
				? reply(200, { client_id: "client-1" })
				: reply(200, {
						access_token: "access-1",
						refresh_token: "refresh-1",
						expires_in: 900,
					}),
		);

		const { url } = await oauth.start("/acme/marketing/setup/connect");
		const state = stateOf(url);
		const attempt = await db.marketingResendAuthAttempt.findUniqueOrThrow({
			where: { state },
		});

		const finished = await oauth.finish("code-1", state);

		const exchange = calls.find((call) => call.url === RESEND_OAUTH.token);
		const sent = new URLSearchParams(exchange?.body ?? "");

		expect(sent.get("grant_type")).toBe("authorization_code");
		expect(sent.get("code")).toBe("code-1");
		expect(sent.get("code_verifier")).toBe(attempt.verifier);
		expect(sent.get("client_secret")).toBeNull();

		expect(finished.returnTo).toBe("/acme/marketing/setup/connect");
		expect(await db.marketingResendAuthAttempt.count()).toBe(0);

		const settings = await readMarketingSettings(db);
		expect(settings.resendAccessToken).toBe("access-1");
		expect(settings.resendRefreshToken).toBe("refresh-1");
		expect(resendConnection(settings)).toBe("oauth");
	});

	it("keeps two concurrent starts apart, so one callback cannot clear the other", async () => {
		stub((url) =>
			url === RESEND_OAUTH.register
				? reply(200, { client_id: "client-1" })
				: reply(200, { access_token: "access-1", expires_in: 900 }),
		);

		const first = await oauth.start();
		const second = await oauth.start();

		await oauth.finish("code-2", stateOf(second.url));

		expect(
			await db.marketingResendAuthAttempt.count({
				where: { state: stateOf(first.url) },
			}),
		).toBe(1);

		expect((await readMarketingSettings(db)).resendAccessToken).toBe(
			"access-1",
		);
	});

	it("keeps the attempt when Resend is merely down, so the callback can be retried", async () => {
		let exchanges = 0;

		stub((url) => {
			if (url === RESEND_OAUTH.register)
				return reply(200, { client_id: "client-1" });

			exchanges += 1;

			return exchanges <= 2
				? reply(503, { error: "server_error" })
				: reply(200, { access_token: "access-1", expires_in: 900 });
		});

		const { url } = await oauth.start();
		const state = stateOf(url);

		await expect(oauth.finish("code-1", state)).rejects.toThrow(/try again/i);

		expect(
			await db.marketingResendAuthAttempt.count({ where: { state } }),
		).toBe(1);

		await oauth.finish("code-1", state);

		expect((await readMarketingSettings(db)).resendAccessToken).toBe(
			"access-1",
		);
		expect(
			await db.marketingResendAuthAttempt.count({ where: { state } }),
		).toBe(0);
	});

	it("spends the attempt when Resend refuses the code, so nothing replays it", async () => {
		stub((url) =>
			url === RESEND_OAUTH.register
				? reply(200, { client_id: "client-1" })
				: reply(400, { error: "invalid_grant" }),
		);

		const { url } = await oauth.start();
		const state = stateOf(url);

		await expect(oauth.finish("code-1", state)).rejects.toThrow();

		expect(
			await db.marketingResendAuthAttempt.count({ where: { state } }),
		).toBe(0);
	});

	it("hands Resend's own refusal back rather than a generic one", async () => {
		stub((url) =>
			url === RESEND_OAUTH.register
				? reply(200, { client_id: "client-1" })
				: reply(400, {
						error: "invalid_grant",
						error_description: "That code is spent.",
					}),
		);

		const { url } = await oauth.start();

		await expect(oauth.finish("code-1", stateOf(url))).rejects.toThrow(
			"That code is spent.",
		);
	});
});

describe("keeping the Resend token fresh", () => {
	it("hands back a token that is still good without calling Resend", async () => {
		stub(() => reply(500, {}));

		await writeMarketingSettings(db, {
			resendClientId: "client-1",
			resendAccessToken: "access-1",
			resendRefreshToken: "refresh-1",
			resendTokenExpires: new Date(Date.now() + 10 * 60_000),
		});

		expect(await oauth.accessToken()).toBe("access-1");
		expect(calls).toHaveLength(0);
	});

	it("refreshes before the token expires, not after", async () => {
		stub(() => reply(200, { access_token: "access-2", expires_in: 900 }));

		await writeMarketingSettings(db, {
			resendClientId: "client-1",
			resendAccessToken: "access-1",
			resendRefreshToken: "refresh-1",
			resendTokenExpires: new Date(Date.now() + RESEND_OAUTH.refreshSkewMs / 2),
		});

		expect(await oauth.accessToken()).toBe("access-2");

		const sent = new URLSearchParams(calls[0]?.body ?? "");
		expect(sent.get("grant_type")).toBe("refresh_token");
		expect(sent.get("refresh_token")).toBe("refresh-1");
		expect((await readMarketingSettings(db)).resendAccessToken).toBe(
			"access-2",
		);
	});

	it("keeps the old refresh token when Resend does not rotate it", async () => {
		stub(() => reply(200, { access_token: "access-2", expires_in: 900 }));

		await writeMarketingSettings(db, {
			resendClientId: "client-1",
			resendAccessToken: "access-1",
			resendRefreshToken: "refresh-1",
			resendTokenExpires: new Date(Date.now() - 1),
		});

		await oauth.accessToken();

		expect((await readMarketingSettings(db)).resendRefreshToken).toBe(
			"refresh-1",
		);
	});

	it("disconnects when Resend says the grant is dead, so nothing claims to be connected", async () => {
		stub(() => reply(400, { error: "invalid_grant" }));

		await writeMarketingSettings(db, {
			resendClientId: "client-1",
			resendAccessToken: "access-1",
			resendRefreshToken: "refresh-1",
			resendTokenExpires: new Date(Date.now() - 1),
		});

		expect(await oauth.accessToken()).toBeNull();

		const settings = await readMarketingSettings(db);
		expect(settings.resendAccessToken).toBeNull();
		expect(settings.resendRefreshToken).toBeNull();
		expect(resendConnection(settings)).toBeNull();
	});

	it("keeps the tokens when Resend is merely down, so a blip is not a disconnect", async () => {
		stub(() => reply(503, { error: "server_error" }));

		await writeMarketingSettings(db, {
			resendClientId: "client-1",
			resendAccessToken: "access-1",
			resendRefreshToken: "refresh-1",
			resendTokenExpires: new Date(Date.now() - 1),
		});

		expect(await oauth.accessToken()).toBeNull();

		const settings = await readMarketingSettings(db);
		expect(settings.resendRefreshToken).toBe("refresh-1");
		expect(resendConnection(settings)).toBe("oauth");
	});

	it("drops a refresh that lands after a disconnect, so nothing is revived", async () => {
		stub(async () => {
			await writeMarketingSettings(db, {
				resendAccessToken: null,
				resendRefreshToken: null,
				resendTokenExpires: null,
			});

			return reply(200, {
				access_token: "access-2",
				refresh_token: "refresh-2",
				expires_in: 900,
			});
		});

		await writeMarketingSettings(db, {
			resendClientId: "client-1",
			resendAccessToken: "access-1",
			resendRefreshToken: "refresh-1",
			resendTokenExpires: new Date(Date.now() - 1),
		});

		expect(await oauth.accessToken()).toBeNull();

		const settings = await readMarketingSettings(db);
		expect(settings.resendAccessToken).toBeNull();
		expect(settings.resendRefreshToken).toBeNull();
		expect(resendConnection(settings)).toBeNull();
	});

	it("lets one instance rotate the grant, and the other reads the new token", async () => {
		let exchanges = 0;

		stub(async () => {
			exchanges += 1;

			if (exchanges > 1) return reply(400, { error: "invalid_grant" });

			await new Promise((resolve) => setTimeout(resolve, 50));

			return reply(200, {
				access_token: "access-2",
				refresh_token: "refresh-2",
				expires_in: 900,
			});
		});

		await writeMarketingSettings(db, {
			resendClientId: "client-1",
			resendAccessToken: "access-1",
			resendRefreshToken: "refresh-1",
			resendTokenExpires: new Date(Date.now() - 1),
		});

		const other = new ResendOauthService(db);

		const [mine, theirs] = await Promise.all([
			oauth.accessToken(),
			other.accessToken(),
		]);

		expect(exchanges).toBe(1);
		expect(mine).toBe("access-2");
		expect(theirs).toBe("access-2");

		const settings = await readMarketingSettings(db);
		expect(settings.resendRefreshToken).toBe("refresh-2");
		expect(resendConnection(settings)).toBe("oauth");
	});

	it("falls back to the API key once a dead grant is cleared", async () => {
		stub(() => reply(400, { error: "invalid_grant" }));

		await writeMarketingSettings(db, {
			resendApiKey: "re_fallback",
			resendClientId: "client-1",
			resendAccessToken: "access-1",
			resendRefreshToken: "refresh-1",
			resendTokenExpires: new Date(Date.now() - 1),
		});

		await oauth.accessToken();

		expect(resendConnection(await readMarketingSettings(db))).toBe("key");
	});

	it("says nothing is connected when no token was ever stored", async () => {
		stub(() => reply(500, {}));

		expect(await oauth.accessToken()).toBeNull();
		expect(calls).toHaveLength(0);
	});
});

describe("disconnecting", () => {
	it("revokes at Resend and forgets every token", async () => {
		stub(() => reply(200, {}));

		await writeMarketingSettings(db, {
			resendClientId: "client-1",
			resendAccessToken: "access-1",
			resendRefreshToken: "refresh-1",
			resendTokenExpires: new Date(Date.now() + 10 * 60_000),
		});

		await oauth.disconnect();

		expect(calls[0]?.url).toBe(RESEND_OAUTH.revoke);
		expect(new URLSearchParams(calls[0]?.body ?? "").get("token")).toBe(
			"refresh-1",
		);

		const settings = await readMarketingSettings(db);
		expect(settings.resendAccessToken).toBeNull();
		expect(settings.resendRefreshToken).toBeNull();
		expect(resendConnection(settings)).toBeNull();
	});
});
