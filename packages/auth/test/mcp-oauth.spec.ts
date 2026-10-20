import { describe, expect, test } from "bun:test";
import { vendorBySlug } from "@crm/mcp-integrations/catalog";
import {
	authorizationServerMetadataUrl,
	checkAuthorizationServer,
	checkProtectedResource,
	createPkce,
	McpOAuthError,
	pkceChallenge,
	protectedResourceMetadataUrl,
} from "../src/mcp-oauth";

const linear = vendorBySlug("linear");
if (!linear) throw new Error("Linear is missing");
const supabase = vendorBySlug("supabase");
if (!supabase) throw new Error("Supabase is missing");

const serverMetadata = {
	issuer: "https://mcp.linear.app",
	authorization_endpoint: "https://mcp.linear.app/authorize",
	token_endpoint: "https://mcp.linear.app/token",
	registration_endpoint: "https://mcp.linear.app/register",
	revocation_endpoint: "https://mcp.linear.app/token",
	code_challenge_methods_supported: ["S256"],
	token_endpoint_auth_methods_supported: [
		"client_secret_basic",
		"client_secret_post",
		"none",
	],
	authorization_response_iss_parameter_supported: true,
};

describe("MCP OAuth discovery", () => {
	test("builds RFC well-known URLs", () => {
		expect(protectedResourceMetadataUrl(linear.mcp.resource)).toBe(
			"https://mcp.linear.app/.well-known/oauth-protected-resource/mcp",
		);
		expect(authorizationServerMetadataUrl("https://mcp.linear.app")).toBe(
			"https://mcp.linear.app/.well-known/oauth-authorization-server",
		);
	});

	test("accepts Linear metadata pinned by the catalog", () => {
		const issuer = checkProtectedResource(linear, {
			resource: "https://mcp.linear.app/mcp",
			authorization_servers: ["https://mcp.linear.app"],
			scopes_supported: ["read", "write"],
		});
		expect(issuer).toBe("https://mcp.linear.app");
		expect(checkAuthorizationServer(issuer, serverMetadata)).toMatchObject({
			issuer,
			registrationEndpoint: "https://mcp.linear.app/register",
		});
	});

	test("accepts Supabase metadata pinned by the catalog", () => {
		const issuer = checkProtectedResource(supabase, {
			resource: "https://mcp.supabase.com/mcp",
			authorization_servers: ["https://api.supabase.com"],
			scopes_supported: [...supabase.access.read_write.scopes],
		});
		expect(issuer).toBe("https://api.supabase.com");
		expect(
			checkAuthorizationServer(issuer, {
				issuer,
				authorization_endpoint: "https://api.supabase.com/v1/oauth/authorize",
				token_endpoint: "https://api.supabase.com/v1/oauth/token",
				registration_endpoint:
					"https://api.supabase.com/platform/oauth/apps/register",
				code_challenge_methods_supported: ["S256", "plain"],
				token_endpoint_auth_methods_supported: [
					"client_secret_basic",
					"client_secret_post",
				],
			}),
		).toMatchObject({ issuer });
	});

	test("rejects changed issuers and endpoint origins", () => {
		expect(() =>
			checkProtectedResource(linear, {
				resource: linear.mcp.resource,
				authorization_servers: ["https://attacker.example"],
			}),
		).toThrow(McpOAuthError);
		expect(() =>
			checkAuthorizationServer("https://mcp.linear.app", {
				...serverMetadata,
				token_endpoint: "https://attacker.example/token",
			}),
		).toThrow(McpOAuthError);
	});

	test("requires dynamic registration and PKCE S256", () => {
		expect(() =>
			checkAuthorizationServer("https://mcp.linear.app", {
				...serverMetadata,
				registration_endpoint: undefined,
			}),
		).toThrow("unsupported_server");
		expect(() =>
			checkAuthorizationServer("https://mcp.linear.app", {
				...serverMetadata,
				code_challenge_methods_supported: ["plain"],
			}),
		).toThrow("unsupported_server");
	});
});

describe("MCP PKCE", () => {
	test("creates a verifier and its S256 challenge", () => {
		const pkce = createPkce();
		expect(pkce.verifier).toHaveLength(43);
		expect(pkce.challenge).toBe(pkceChallenge(pkce.verifier));
	});
});
