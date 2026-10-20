import { createHash, randomBytes } from "node:crypto";
import { safeFetch } from "@crm/db/safe-fetch";
import type { Vendor } from "@crm/mcp-integrations/vendor";
import { z } from "zod";
import { MCP_AUTH } from "./mcp-config";

export const oauthFailure = z.enum([
	"discovery_failed",
	"untrusted_server",
	"unsupported_server",
	"registration_failed",
	"invalid_client",
	"invalid_grant",
	"server_error",
	"timeout",
	"bad_response",
]);

export type OAuthFailure = z.infer<typeof oauthFailure>;

export class McpOAuthError extends Error {
	constructor(readonly failure: OAuthFailure) {
		super(`MCP OAuth request failed: ${failure}`);
		this.name = "McpOAuthError";
	}
}

const protectedResourceMetadata = z.object({
	resource: z.url(),
	authorization_servers: z.array(z.url()).min(1),
	scopes_supported: z
		.array(z.string().trim().min(1).max(256))
		.max(200)
		.optional(),
});

const authorizationServerMetadata = z.object({
	issuer: z.url(),
	authorization_endpoint: z.url(),
	token_endpoint: z.url(),
	registration_endpoint: z.url().optional(),
	revocation_endpoint: z.url().optional(),
	code_challenge_methods_supported: z.array(z.string()).optional(),
	token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
	authorization_response_iss_parameter_supported: z.boolean().optional(),
});

const registrationResponse = z.object({
	client_id: z.string().min(1).max(4_096),
	client_secret: z.string().max(4_096).optional(),
	registration_access_token: z.string().max(16_384).optional(),
	client_id_issued_at: z.number().int().nonnegative().optional(),
	client_secret_expires_at: z.number().int().nonnegative().optional(),
	scope: z.string().max(16_384).optional(),
});

const tokenResponse = z.object({
	access_token: z.string().min(1).max(16_384),
	token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
	expires_in: z.coerce.number().int().positive().optional(),
	refresh_token: z.string().min(1).max(16_384).optional(),
	scope: z.string().max(16_384).optional(),
});

const errorResponse = z.object({ error: z.string() });

export type AuthorizationServer = {
	issuer: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	registrationEndpoint: string;
	revocationEndpoint: string | null;
	tokenEndpointAuthMethods: readonly string[];
	issParameterSupported: boolean;
};

export type RegisteredClient = {
	clientId: string;
	clientSecret: string | null;
	registrationAccessToken: string | null;
	clientIdIssuedAt: number | null;
	clientSecretExpiresAt: number | null;
	scope: string | null;
};

export type ClientCredentials = {
	clientId: string;
	clientSecret: string | null;
};

export type TokenSet = {
	accessToken: string;
	refreshToken: string | null;
	expiresIn: number | null;
	scope: string | null;
};

export type Pkce = {
	verifier: string;
	challenge: string;
};

export type OAuthFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

function normalizedUrl(value: string): string | null {
	try {
		const url = new URL(value);
		url.hash = "";
		return url.toString();
	} catch {
		return null;
	}
}

function sameUrl(left: string, right: string): boolean {
	return normalizedUrl(left) === normalizedUrl(right);
}

function httpsOrigin(value: string): string | null {
	try {
		const url = new URL(value);
		return url.protocol === "https:" ? url.origin : null;
	} catch {
		return null;
	}
}

function wellKnownUrl(value: string, name: string): string {
	const url = new URL(value);
	const path = url.pathname === "/" ? "" : url.pathname;
	url.pathname = `/.well-known/${name}${path}`;
	url.search = "";
	url.hash = "";
	return url.toString();
}

export function protectedResourceMetadataUrl(resource: string): string {
	return wellKnownUrl(resource, "oauth-protected-resource");
}

export function authorizationServerMetadataUrl(issuer: string): string {
	return wellKnownUrl(issuer, "oauth-authorization-server");
}

export function createPkce(): Pkce {
	const verifier = randomBytes(32).toString("base64url");
	return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

export function checkProtectedResource(
	vendor: Vendor,
	value: z.input<typeof protectedResourceMetadata>,
): string {
	const parsed = protectedResourceMetadata.safeParse(value);
	if (!parsed.success || !sameUrl(parsed.data.resource, vendor.mcp.resource)) {
		throw new McpOAuthError("discovery_failed");
	}

	const issuer = vendor.auth.authorizationServers.find((allowed) =>
		parsed.data.authorization_servers.some((found) => sameUrl(found, allowed)),
	);
	if (!issuer) throw new McpOAuthError("untrusted_server");
	return issuer;
}

export function checkAuthorizationServer(
	issuer: string,
	value: z.input<typeof authorizationServerMetadata>,
	endpointOrigins: readonly string[] = [],
): AuthorizationServer {
	const parsed = authorizationServerMetadata.safeParse(value);
	if (!parsed.success) throw new McpOAuthError("discovery_failed");

	const issuerOrigin = httpsOrigin(issuer);
	if (!issuerOrigin || !sameUrl(parsed.data.issuer, issuer)) {
		throw new McpOAuthError("untrusted_server");
	}

	if (
		!parsed.data.registration_endpoint ||
		!parsed.data.code_challenge_methods_supported?.includes("S256")
	) {
		throw new McpOAuthError("unsupported_server");
	}

	const allowedOrigins = new Set([issuerOrigin, ...endpointOrigins]);
	const endpoints = [
		parsed.data.authorization_endpoint,
		parsed.data.token_endpoint,
		parsed.data.registration_endpoint,
		parsed.data.revocation_endpoint,
	].filter((value): value is string => value !== undefined);

	if (
		endpoints.some(
			(endpoint) => !allowedOrigins.has(httpsOrigin(endpoint) ?? ""),
		)
	) {
		throw new McpOAuthError("untrusted_server");
	}

	return {
		issuer: parsed.data.issuer,
		authorizationEndpoint: parsed.data.authorization_endpoint,
		tokenEndpoint: parsed.data.token_endpoint,
		registrationEndpoint: parsed.data.registration_endpoint,
		revocationEndpoint: parsed.data.revocation_endpoint ?? null,
		tokenEndpointAuthMethods: parsed.data
			.token_endpoint_auth_methods_supported ?? ["client_secret_basic"],
		issParameterSupported:
			parsed.data.authorization_response_iss_parameter_supported === true,
	};
}

async function readJson(response: Response): Promise<z.infer<typeof z.json>> {
	const length = Number(response.headers.get("content-length") ?? "0");
	if (length > MCP_AUTH.request.maxBodyBytes) {
		throw new McpOAuthError("bad_response");
	}

	const body = new Uint8Array(await response.arrayBuffer());
	if (body.byteLength > MCP_AUTH.request.maxBodyBytes) {
		throw new McpOAuthError("bad_response");
	}

	try {
		return z.json().parse(JSON.parse(new TextDecoder().decode(body)));
	} catch {
		throw new McpOAuthError("bad_response");
	}
}

function clientAuth(
	server: AuthorizationServer,
	client: ClientCredentials,
	params: URLSearchParams,
): Headers {
	const headers = new Headers({
		accept: "application/json",
		"content-type": "application/x-www-form-urlencoded",
	});

	if (
		client.clientSecret &&
		server.tokenEndpointAuthMethods.includes("client_secret_basic")
	) {
		headers.set(
			"authorization",
			`Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`,
		);
	} else {
		params.set("client_id", client.clientId);
		if (
			client.clientSecret &&
			server.tokenEndpointAuthMethods.includes("client_secret_post")
		) {
			params.set("client_secret", client.clientSecret);
		}
	}

	return headers;
}

export class McpOAuthClient {
	constructor(private readonly send: OAuthFetch = fetch) {}

	async discover(vendor: Vendor): Promise<AuthorizationServer> {
		const resource = protectedResourceMetadata.parse(
			await this.metadata(protectedResourceMetadataUrl(vendor.mcp.resource)),
		);
		const issuer = checkProtectedResource(vendor, resource);
		const server = authorizationServerMetadata.parse(
			await this.metadata(authorizationServerMetadataUrl(issuer)),
		);
		return checkAuthorizationServer(
			issuer,
			server,
			vendor.auth.endpointOrigins ?? [],
		);
	}

	async register(
		server: AuthorizationServer,
		redirectUri: string,
		scopes: readonly string[],
	): Promise<RegisteredClient> {
		const method = ["client_secret_basic", "client_secret_post", "none"].find(
			(candidate) => server.tokenEndpointAuthMethods.includes(candidate),
		);
		if (!method) throw new McpOAuthError("unsupported_server");

		const response = await this.request(server.registrationEndpoint, {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				client_name: "Comp AI CRM",
				redirect_uris: [redirectUri],
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
				token_endpoint_auth_method: method,
				scope: scopes.join(" "),
			}),
		});
		const body = registrationResponse.safeParse(await readJson(response));
		if (![200, 201].includes(response.status) || !body.success) {
			throw new McpOAuthError("registration_failed");
		}

		return {
			clientId: body.data.client_id,
			clientSecret: body.data.client_secret || null,
			registrationAccessToken: body.data.registration_access_token || null,
			clientIdIssuedAt: body.data.client_id_issued_at ?? null,
			clientSecretExpiresAt: body.data.client_secret_expires_at ?? null,
			scope: body.data.scope ?? null,
		};
	}

	exchangeCode(
		server: AuthorizationServer,
		client: ClientCredentials,
		input: {
			code: string;
			verifier: string;
			redirectUri: string;
			resource: string;
		},
	): Promise<TokenSet> {
		return this.token(server, client, {
			grant_type: "authorization_code",
			code: input.code,
			code_verifier: input.verifier,
			redirect_uri: input.redirectUri,
			resource: input.resource,
		});
	}

	refresh(
		server: AuthorizationServer,
		client: ClientCredentials,
		refreshToken: string,
		resource: string,
	): Promise<TokenSet> {
		return this.token(server, client, {
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			resource,
		});
	}

	async revoke(
		server: AuthorizationServer,
		client: ClientCredentials,
		token: string,
	): Promise<void> {
		if (!server.revocationEndpoint) return;
		const params = new URLSearchParams({
			token,
			token_type_hint: "access_token",
		});
		const response = await this.request(server.revocationEndpoint, {
			method: "POST",
			headers: clientAuth(server, client, params),
			body: params,
		});
		if (response.status < 200 || response.status >= 300) {
			throw new McpOAuthError(
				response.status >= 500 ? "server_error" : "bad_response",
			);
		}
	}

	private async metadata(url: string): Promise<z.infer<typeof z.json>> {
		const result = await safeFetch(url, {
			timeoutMs: MCP_AUTH.request.timeoutMs,
			headers: { accept: "application/json" },
		});
		if (result?.response.status !== 200) {
			throw new McpOAuthError("discovery_failed");
		}
		return readJson(result.response);
	}

	private async token(
		server: AuthorizationServer,
		client: ClientCredentials,
		input: Readonly<Record<string, string>>,
	): Promise<TokenSet> {
		const params = new URLSearchParams(input);
		const response = await this.request(server.tokenEndpoint, {
			method: "POST",
			headers: clientAuth(server, client, params),
			body: params,
		});
		const value = await readJson(response);

		if (response.status === 200) {
			const body = tokenResponse.safeParse(value);
			if (!body.success) throw new McpOAuthError("bad_response");
			return {
				accessToken: body.data.access_token,
				refreshToken: body.data.refresh_token ?? null,
				expiresIn: body.data.expires_in ?? null,
				scope: body.data.scope ?? null,
			};
		}

		const error = errorResponse.safeParse(value);
		if (error.success && error.data.error === "invalid_client") {
			throw new McpOAuthError("invalid_client");
		}
		if (error.success && error.data.error === "invalid_grant") {
			throw new McpOAuthError("invalid_grant");
		}
		throw new McpOAuthError(
			response.status >= 500 ? "server_error" : "bad_response",
		);
	}

	private async request(url: string, init: RequestInit): Promise<Response> {
		try {
			return await this.send(url, {
				...init,
				redirect: "error",
				signal: AbortSignal.timeout(MCP_AUTH.request.timeoutMs),
			});
		} catch (error) {
			if (error instanceof McpOAuthError) throw error;
			throw new McpOAuthError("timeout");
		}
	}
}
