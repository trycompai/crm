import { describe, expect, it } from "bun:test";
import {
	BRIDGE_AUDIENCE,
	BRIDGE_ISSUER,
	repFromCrm,
} from "../agent/channels/eve";
import { isAutomated } from "../agent/lib/approval";

const SECRET = "test-secret-at-least-long-enough-to-be-a-secret";
const auth = repFromCrm(SECRET);

type BridgeHeader = { alg: string; typ: string };

type BridgeClaims = {
	iss: string;
	aud: string;
	sub: string | undefined;
	email: string;
	name: string;
	iat: number;
	nbf: number;
	exp: number;
};

async function mint(claims: BridgeClaims, secret = SECRET): Promise<string> {
	const encode = (value: BridgeClaims | BridgeHeader) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");

	const signingInput = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
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
		new TextEncoder().encode(signingInput),
	);

	return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

function request(token: string | null): Request {
	return new Request("https://agent.example.com/eve/v1/session", {
		method: "POST",
		headers: token ? { authorization: `Bearer ${token}` } : {},
	});
}

function claims(overrides: Partial<BridgeClaims> = {}): BridgeClaims {
	const now = Math.floor(Date.now() / 1000);
	return {
		iss: BRIDGE_ISSUER,
		aud: BRIDGE_AUDIENCE,
		sub: "user_123",
		email: "lewis@trycomp.ai",
		name: "Lewis Carhart",
		iat: now,
		nbf: now - 5,
		exp: now + 120,
		...overrides,
	};
}

describe("repFromCrm", () => {
	it("resolves a valid token to the rep, as a person", async () => {
		const result = await auth(request(await mint(claims())));

		expect(result).toMatchObject({
			authenticator: "crm-app",
			principalId: "user_123",
			principalType: "user",
		});
	});

	it("produces a principal the approval policy reads as human", async () => {
		const session = await auth(request(await mint(claims())));

		expect(isAutomated({ auth: { current: session } })).toBe(false);
	});

	it("carries the rep's identity for the agent to attribute work to", async () => {
		const session = await auth(request(await mint(claims())));

		expect(session).toMatchObject({
			attributes: { email: "lewis@trycomp.ai", name: "Lewis Carhart" },
		});
	});

	it("skips a request with no token, rather than accepting it", async () => {
		expect(await auth(request(null))).toBeNull();
	});

	it("skips a token signed with the wrong secret", async () => {
		const forged = await mint(claims(), "not-the-shared-secret");
		expect(await auth(request(forged))).toBeNull();
	});

	it("skips a token whose payload was swapped for another user", async () => {
		const token = await mint(claims());
		const [header, , signature] = token.split(".");
		const impersonated = Buffer.from(
			JSON.stringify(claims({ sub: "somebody_else" })),
		).toString("base64url");

		expect(
			await auth(request(`${header}.${impersonated}.${signature}`)),
		).toBeNull();
	});

	it("skips a token whose signature was altered", async () => {
		const token = await mint(claims());
		const [header, payload, signature] = token.split(".");

		const middle = Math.floor((signature as string).length / 2);
		const swapped = (signature as string)[middle] === "A" ? "B" : "A";
		const altered = `${(signature as string).slice(0, middle)}${swapped}${(
			signature as string
		).slice(middle + 1)}`;

		expect(await auth(request(`${header}.${payload}.${altered}`))).toBeNull();
	});

	it("skips an expired token", async () => {
		const now = Math.floor(Date.now() / 1000);
		const stale = await mint(claims({ iat: now - 600, exp: now - 300 }));
		expect(await auth(request(stale))).toBeNull();
	});

	it("skips a token minted for a different agent", async () => {
		expect(
			await auth(request(await mint(claims({ aud: "someone-else" })))),
		).toBeNull();
	});

	it("skips a token from a different issuer", async () => {
		expect(
			await auth(request(await mint(claims({ iss: "not-our-app" })))),
		).toBeNull();
	});

	it("skips a token that names nobody", async () => {
		expect(
			await auth(request(await mint(claims({ sub: undefined })))),
		).toBeNull();
	});
});
