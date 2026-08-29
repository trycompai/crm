import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";

const fallback = (key: string, value: string) => {
	if (!process.env[key]) {
		process.env[key] = value;
	}
};

fallback(
	"DATABASE_URL",
	"postgresql://postgres:postgres@localhost:5432/crm?schema=public",
);
process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-characters-long";
fallback("API_URL", "http://localhost:3001");
fallback("ALLOWED_SIGN_IN", "example.com");
fallback("GOOGLE_CLIENT_ID", "test-google-client-id");
fallback("GOOGLE_CLIENT_SECRET", "test-google-client-secret");

describe("Auth (e2e)", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const { db } = await import("@crm/db");
		await db.jwks.deleteMany();
		const { AppModule } = await import("../src/app.module");

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication({ bodyParser: false });
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it("rejects an unauthenticated request to a guarded route", async () => {
		await request(app.getHttpServer()).get("/auth/me").expect(401);
	});

	it("allows an unauthenticated request to an optional-auth route", async () => {
		const response = await request(app.getHttpServer())
			.get("/auth/session")
			.expect(200);

		expect(response.body).toEqual({ authenticated: false, user: null });
	});

	it("mounts the Better Auth handler", async () => {
		const response = await request(app.getHttpServer()).get("/api/auth/ok");

		expect(response.status).not.toBe(404);
	});

	it("publishes OAuth authorization-server metadata", async () => {
		const response = await request(app.getHttpServer())
			.get("/.well-known/oauth-authorization-server/api/auth")
			.expect(200);

		expect(response.body.issuer).toBe("http://localhost:3001/api/auth");
		expect(response.body.authorization_endpoint).toBe(
			"http://localhost:3001/api/auth/oauth2/authorize",
		);
		expect(response.body.code_challenge_methods_supported).toContain("S256");
	});

	it("publishes OpenID Connect metadata", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/auth/.well-known/openid-configuration")
			.expect(200);

		expect(response.body.issuer).toBe("http://localhost:3001/api/auth");
		expect(response.body.jwks_uri).toBe("http://localhost:3001/api/auth/jwks");
	});

	it("publishes protected-resource metadata", async () => {
		const response = await request(app.getHttpServer())
			.get("/.well-known/oauth-protected-resource/api")
			.expect(200);

		expect(response.body.resource).toBe("http://localhost:3001/api");
		expect(response.body.scopes_supported).toEqual(["crm.read", "crm.write"]);
	});

	it("rejects multiple credential types", async () => {
		await request(app.getHttpServer())
			.get("/auth/session")
			.set("cookie", "crm.session_token=invalid")
			.set("authorization", "Bearer invalid")
			.expect(400);
	});

	it("returns a bearer challenge for an invalid token", async () => {
		const response = await request(app.getHttpServer())
			.get("/auth/session")
			.set("authorization", "Bearer invalid")
			.expect(401);

		expect(response.headers["www-authenticate"]).toContain("invalid_token");
	});

	it("issues and refreshes OAuth tokens through PKCE", async () => {
		const { db } = await import("@crm/db");
		const userId = `oauth-test-${crypto.randomUUID()}`;
		const sessionToken = `oauth-session-${crypto.randomUUID()}`;
		const verifier = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
			"-",
			"",
		);
		const challenge = Buffer.from(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
		).toString("base64url");

		await db.user.create({
			data: {
				id: userId,
				email: `${userId}@example.com`,
				name: "OAuth Test",
				emailVerified: true,
				updatedAt: new Date(),
			},
		});
		await db.session.create({
			data: {
				id: sessionToken,
				token: sessionToken,
				userId,
				expiresAt: new Date(Date.now() + 60_000),
				updatedAt: new Date(),
			},
		});

		try {
			const cookie = `crm.session_token=${await signCookieValue(sessionToken)}`;
			const authorization = await request(app.getHttpServer())
				.get("/api/auth/oauth2/authorize")
				.set("cookie", cookie)
				.query({
					client_id: "compcrm-flutter",
					redirect_uri: "ai.trycrm.app:/oauth/callback",
					response_type: "code",
					scope: "openid profile email offline_access crm.read crm.write",
					code_challenge: challenge,
					code_challenge_method: "S256",
					state: "oauth-test-state",
					nonce: "oauth-test-nonce",
					resource: "http://localhost:3001/api",
				})
				.expect(302);
			const location = authorization.headers.location;
			if (!location)
				throw new Error("OAuth authorization returned no redirect.");
			const redirectUrl = new URL(location);
			const code = redirectUrl.searchParams.get("code");
			expect(code).toBeTruthy();
			expect(redirectUrl.searchParams.get("state")).toBe("oauth-test-state");

			const tokenResponse = await request(app.getHttpServer())
				.post("/api/auth/oauth2/token")
				.type("form")
				.send({
					grant_type: "authorization_code",
					client_id: "compcrm-flutter",
					redirect_uri: "ai.trycrm.app:/oauth/callback",
					resource: "http://localhost:3001/api",
					code,
					code_verifier: verifier,
				})
				.expect(200);
			expect(tokenResponse.body.access_token).toEqual(expect.any(String));
			expect(tokenResponse.body.id_token).toEqual(expect.any(String));
			expect(tokenResponse.body.refresh_token).toEqual(expect.any(String));
			expect(tokenResponse.body.access_token.split(".")).toHaveLength(3);
			const { verifyAccessTokenRequest } = await import("@crm/auth");
			await verifyAccessTokenRequest(
				new Request("http://localhost:3001/auth/session", {
					headers: {
						authorization: `Bearer ${tokenResponse.body.access_token}`,
					},
				}),
				{
					verifyOptions: {
						issuer: "http://localhost:3001/api/auth",
						audience: "http://localhost:3001/api",
					},
				},
			);

			const principal = await request(app.getHttpServer())
				.get("/auth/session")
				.set("authorization", `Bearer ${tokenResponse.body.access_token}`)
				.expect(200);
			expect(principal.body.user.id).toBe(userId);

			const refreshed = await request(app.getHttpServer())
				.post("/api/auth/oauth2/token")
				.type("form")
				.send({
					grant_type: "refresh_token",
					client_id: "compcrm-flutter",
					refresh_token: tokenResponse.body.refresh_token,
					resource: "http://localhost:3001/api",
				})
				.expect(200);
			expect(refreshed.body.access_token).toEqual(expect.any(String));
			expect(refreshed.body.refresh_token).toEqual(expect.any(String));
		} finally {
			await db.user.delete({ where: { id: userId } });
		}
	});

	it("lets the sign-in page read what it may offer", async () => {
		const response = await request(app.getHttpServer())
			.get("/api/trpc/sso.signInOptions")
			.expect(200);

		const microsoftConfigured = Boolean(
			process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET,
		);

		expect(response.body.result.data).toEqual({
			google: true,
			microsoft: microsoftConfigured,
			providers: [],
		});
	});

	it("keeps the SSO configuration itself behind the session", async () => {
		const response = await request(app.getHttpServer()).get(
			"/api/trpc/sso.settings",
		);

		expect(response.status).toBe(401);
	});
});

async function signCookieValue(value: string): Promise<string> {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error("BETTER_AUTH_SECRET is required.");
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(value),
	);
	return encodeURIComponent(
		`${value}.${Buffer.from(signature).toString("base64")}`,
	);
}
