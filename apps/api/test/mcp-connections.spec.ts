import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { createMcpSecretBox } from "@crm/auth/mcp-crypto";
import { type AuthorizationServer, McpOAuthClient } from "@crm/auth/mcp-oauth";
import type { Db } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import {
	assertGrantedScopeBounds,
	McpConnectionsService,
} from "../src/mcp/mcp-connections.service";

const userId = "mcp-service-user";
const encryptionKey = Buffer.alloc(32, 7).toString("base64");
let previousKey: string | undefined;

function serviceFor(input: {
	role?: string | null;
	connections?: unknown[];
	agents?: unknown[];
	oauthState?: unknown;
	connection?: unknown;
	registration?: unknown;
	consumeCount?: number;
	oauth?: McpOAuthClient;
	callbackTransaction?: boolean;
}) {
	type ConnectionUpdate = Parameters<Db["mcpConnection"]["update"]>[0];
	type ConnectionUpsert = Parameters<Db["mcpConnection"]["upsert"]>[0];
	type AgentTaskCreate = Parameters<Db["agentTask"]["create"]>[0];
	type RegistrationUpsert = Parameters<
		Db["mcpClientRegistration"]["upsert"]
	>[0];
	type OauthStateCreate = Parameters<Db["mcpOauthState"]["create"]>[0];
	const updates: ConnectionUpdate[] = [];
	const registrationUpserts: RegistrationUpsert[] = [];
	let db: Db;
	const transaction = input.callbackTransaction
		? async (operation: (tx: Db) => Promise<object>) => operation(db)
		: async (operations: Promise<object>[]) => Promise.all(operations);
	db = {
		member: {
			findUnique: async () =>
				input.role === null ? null : { role: input.role ?? "owner" },
		},
		mcpConnection: {
			findMany: async () => input.connections ?? [],
			findUnique: async () => input.connection ?? null,
			findUniqueOrThrow: async () => input.connection,
			upsert: async (value: ConnectionUpsert) => value,
			update: async (value: ConnectionUpdate) => {
				updates.push(value);
				return value;
			},
		},
		agentTask: { create: async (value: AgentTaskCreate) => value },
		agentDefinition: { findMany: async () => input.agents ?? [] },
		mcpClientRegistration: {
			findUnique: async () => input.registration ?? null,
			upsert: async (value: RegistrationUpsert) => {
				registrationUpserts.push(value);
				return {
					id: "registration-1",
					clientId: "refreshed-client",
					...(value as { update?: object }).update,
				};
			},
		},
		mcpOauthState: {
			findUnique: async () => input.oauthState ?? null,
			updateMany: async () => ({ count: input.consumeCount ?? 0 }),
			create: async (value: OauthStateCreate) => value,
		},
		$transaction: transaction,
	} as unknown as Db;
	const oauth = input.oauth ?? ({} as McpOAuthClient);
	const discoveries: boolean[] = [];
	const agent = {
		mcpToolDiscoveryQueued() {
			discoveries.push(true);
		},
	} as AgentTriggerService;

	return {
		service: new McpConnectionsService(db, oauth, agent),
		updates,
		registrationUpserts,
		discoveries,
	};
}

beforeEach(() => {
	previousKey = process.env.MCP_ENCRYPTION_KEY;
	process.env.MCP_ENCRYPTION_KEY = encryptionKey;
});

afterEach(() => {
	if (previousKey === undefined) delete process.env.MCP_ENCRYPTION_KEY;
	else process.env.MCP_ENCRYPTION_KEY = previousKey;
});

describe("MCP connections", () => {
	it("accepts the resource scopes selected during PlanetScale authorization", () => {
		expect(() =>
			assertGrantedScopeBounds("planetscale", "READ_WRITE", [
				"read_databases",
				"database:read_database",
				"database:write_database",
			]),
		).not.toThrow();
	});

	it("rejects write scopes from a read-only authorization", () => {
		expect(() =>
			assertGrantedScopeBounds("planetscale", "READ_ONLY", [
				"read_databases",
				"database:write_database",
			]),
		).toThrow("unexpected access");
	});

	it("reports missing optional encryption without breaking the catalog", async () => {
		delete process.env.MCP_ENCRYPTION_KEY;
		const { service } = serviceFor({ role: "member" });

		const result = await service.list(userId);

		expect(result.configured).toBe(false);
		expect(result.canManage).toBe(false);
		expect(result.entries.length).toBeGreaterThan(0);
	});

	it("refuses connection management for a member", async () => {
		const { service } = serviceFor({ role: "member" });

		expect(
			service.start(userId, {
				platformSlug: "linear",
				accessMode: "read_only",
				returnPath: "/tripwire/settings/connections/linear",
			}),
		).rejects.toThrow("Only an owner or an admin");
	});

	it("refuses an expired OAuth state", async () => {
		const { service } = serviceFor({
			oauthState: {
				id: "state-1",
				userId,
				consumedAt: null,
				expiresAt: new Date(Date.now() - 1),
				registration: {},
			},
		});

		expect(
			service.callback({ state: "expired", code: "code", userId }),
		).rejects.toThrow("authorization state is invalid");
	});

	it("refuses a replayed OAuth state", async () => {
		const { service } = serviceFor({
			oauthState: {
				id: "state-1",
				userId,
				consumedAt: new Date(),
				expiresAt: new Date(Date.now() + 60_000),
				registration: {},
			},
		});

		expect(
			service.callback({ state: "replayed", code: "code", userId }),
		).rejects.toThrow("authorization state is invalid");
	});

	it("refreshes a cached registration after the encryption key changes", async () => {
		const previousBox = createMcpSecretBox(
			Buffer.alloc(32, 9).toString("base64"),
		);
		if (!previousBox)
			throw new Error("The previous encryption key is invalid.");
		const server: AuthorizationServer = {
			issuer: "https://mcp.cloudflare.com",
			authorizationEndpoint: "https://mcp.cloudflare.com/authorize",
			tokenEndpoint: "https://mcp.cloudflare.com/token",
			registrationEndpoint: "https://mcp.cloudflare.com/register",
			revocationEndpoint: null,
			tokenEndpointAuthMethods: ["client_secret_post"],
			issParameterSupported: true,
		};
		const oauth = new McpOAuthClient();
		let registrationCount = 0;
		oauth.discover = async () => server;
		oauth.register = async () => {
			registrationCount += 1;
			return {
				clientId: "refreshed-client",
				clientSecret: "refreshed-secret",
				registrationAccessToken: null,
				clientIdIssuedAt: null,
				clientSecretExpiresAt: null,
				scope: null,
			};
		};
		const metadataFingerprint = createHash("sha256")
			.update(JSON.stringify(server))
			.digest("hex");
		const { service, registrationUpserts } = serviceFor({
			oauth,
			callbackTransaction: true,
			registration: {
				id: "registration-1",
				clientId: "stale-client",
				encryptedClientSecret: previousBox.encrypt(
					"stale-secret",
					"mcp-registration:registration-1",
				),
				encryptedRegistrationAccessToken: null,
				clientSecretExpiresAt: null,
				metadataFingerprint,
			},
		});

		const result = await service.start(userId, {
			platformSlug: "cloudflare",
			accessMode: "read_only",
			returnPath: "/tripwire/settings/connections/cloudflare",
		});

		expect(registrationCount).toBe(1);
		expect(registrationUpserts).toHaveLength(1);
		expect(new URL(result.authorizationUrl).searchParams.get("client_id")).toBe(
			"refreshed-client",
		);
	});

	it("returns a restart error for callback credentials from an old key", async () => {
		const rawState = "stale-cloudflare-state";
		const hash = createHash("sha256").update(rawState).digest("hex");
		const previousBox = createMcpSecretBox(
			Buffer.alloc(32, 9).toString("base64"),
		);
		if (!previousBox)
			throw new Error("The previous encryption key is invalid.");
		const server: AuthorizationServer = {
			issuer: "https://mcp.cloudflare.com",
			authorizationEndpoint: "https://mcp.cloudflare.com/authorize",
			tokenEndpoint: "https://mcp.cloudflare.com/token",
			registrationEndpoint: "https://mcp.cloudflare.com/register",
			revocationEndpoint: null,
			tokenEndpointAuthMethods: ["client_secret_post"],
			issParameterSupported: true,
		};
		const oauth = new McpOAuthClient();
		oauth.discover = async () => server;
		const { service } = serviceFor({
			consumeCount: 1,
			oauth,
			oauthState: {
				id: "state-1",
				userId,
				stateHash: hash,
				platformSlug: "cloudflare",
				accessMode: "READ_WRITE",
				consumedAt: null,
				expiresAt: new Date(Date.now() + 60_000),
				encryptedCodeVerifier: previousBox.encrypt(
					"verifier",
					`mcp-state:${hash}`,
				),
				registration: {
					id: "registration-1",
					clientId: "stale-client",
					encryptedClientSecret: previousBox.encrypt(
						"stale-secret",
						"mcp-registration:registration-1",
					),
					metadataFingerprint: createHash("sha256")
						.update(JSON.stringify(server))
						.digest("hex"),
				},
			},
		});

		expect(
			service.callback({ state: rawState, code: "code", userId }),
		).rejects.toThrow("authorization must restart");
	});

	it("wakes MCP discovery after OAuth completes", async () => {
		const rawState = "clerk-state";
		const hash = createHash("sha256").update(rawState).digest("hex");
		const box = createMcpSecretBox(encryptionKey);
		if (!box) throw new Error("The test encryption key is invalid.");
		const server: AuthorizationServer = {
			issuer: "https://clerk.clerk.com",
			authorizationEndpoint: "https://clerk.clerk.com/oauth/authorize",
			tokenEndpoint: "https://clerk.clerk.com/oauth/token",
			registrationEndpoint: "https://clerk.clerk.com/oauth/register",
			revocationEndpoint: null,
			tokenEndpointAuthMethods: ["none"],
			issParameterSupported: true,
		};
		const oauth = new McpOAuthClient();
		oauth.discover = async () => server;
		oauth.exchangeCode = async () => ({
			accessToken: "clerk-access-token",
			refreshToken: null,
			expiresIn: 3_600,
			scope: "applications:read users:read applications:manage",
		});
		const { service, discoveries } = serviceFor({
			consumeCount: 1,
			connection: { id: "clerk-connection" },
			oauth,
			oauthState: {
				id: "clerk-state-row",
				userId,
				stateHash: hash,
				platformSlug: "clerk",
				accessMode: "READ_WRITE",
				consumedAt: null,
				expiresAt: new Date(Date.now() + 60_000),
				encryptedCodeVerifier: box.encrypt(
					"clerk-verifier",
					`mcp-state:${hash}`,
				),
				returnPath: "/tripwire/settings/connections/clerk",
				registration: {
					id: "clerk-registration",
					clientId: "clerk-client",
					encryptedClientSecret: null,
					metadataFingerprint: createHash("sha256")
						.update(JSON.stringify(server))
						.digest("hex"),
				},
			},
		});

		await service.callback({ state: rawState, code: "clerk-code", userId });

		expect(discoveries).toHaveLength(1);
	});

	it("returns the stored token before its refresh window", async () => {
		const connectionId = "connection-1";
		const box = createMcpSecretBox(encryptionKey);
		if (!box) throw new Error("The test encryption key is invalid.");
		const expiresAt = Date.now() + 10 * 60_000;
		const { service, updates } = serviceFor({
			connection: {
				id: connectionId,
				platformSlug: "linear",
				status: "CONNECTED",
				encryptedAccessToken: box.encrypt(
					"access-token",
					`mcp-connection:${connectionId}:access`,
				),
				encryptedRefreshToken: null,
				tokenExpiresAt: new Date(expiresAt),
				registration: {},
			},
		});

		await expect(service.token(connectionId)).resolves.toEqual({
			token: "access-token",
			expiresAt,
		});
		expect(updates).toEqual([]);
	});
});
