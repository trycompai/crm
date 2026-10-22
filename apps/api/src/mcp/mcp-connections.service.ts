import { createHash, randomBytes, randomUUID } from "node:crypto";
import { apiUrl, appUrl } from "@crm/auth/env";
import { MCP_AUTH } from "@crm/auth/mcp-config";
import { createMcpSecretBox, type McpSecretBox } from "@crm/auth/mcp-crypto";
import {
	type AuthorizationServer,
	createPkce,
	McpOAuthClient,
	McpOAuthError,
} from "@crm/auth/mcp-oauth";
import {
	canManageConnections,
	WORKSPACE_ID,
	workspaceRoleOf,
} from "@crm/auth/organization";
import type { Db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import {
	vendorAccess,
	vendorBySlug,
	vendors,
} from "@crm/mcp-integrations/catalog";
import type { AccessMode, Vendor } from "@crm/mcp-integrations/vendor";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type { McpStartInput } from "./mcp.contracts";
import { agentsByMcpPlatform } from "./mcp-agent-usage";

type CallbackInput = {
	state: string;
	code: string;
	issuer?: string;
	userId: string;
};

const STATUS = {
	CONNECTING: "connecting",
	CONNECTED: "connected",
	ERROR: "error",
	DISCONNECTED: "disconnected",
} as const;

const ACCESS_MODE = {
	read_only: "READ_ONLY",
	read_write: "READ_WRITE",
} as const;

function fingerprint(value: AuthorizationServer): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stateHash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function tokenPurpose(
	connectionId: string,
	kind: "access" | "refresh",
): string {
	return `mcp-connection:${connectionId}:${kind}`;
}

function registrationPurpose(registrationId: string): string {
	return `mcp-registration:${registrationId}`;
}

function registrationAccessPurpose(registrationId: string): string {
	return `mcp-registration:${registrationId}:access`;
}

function statePurpose(hash: string): string {
	return `mcp-state:${hash}`;
}

function decryptAuthorizationValue(
	box: McpSecretBox,
	value: string,
	purpose: string,
): string {
	try {
		return box.decrypt(value, purpose);
	} catch {
		throw new BadRequestException("The MCP authorization must restart.");
	}
}

function registrationIsReadable(
	box: McpSecretBox,
	registration: {
		id: string;
		encryptedClientSecret: string | null;
		encryptedRegistrationAccessToken: string | null;
	},
): boolean {
	try {
		if (registration.encryptedClientSecret) {
			box.decrypt(
				registration.encryptedClientSecret,
				registrationPurpose(registration.id),
			);
		}
		if (registration.encryptedRegistrationAccessToken) {
			box.decrypt(
				registration.encryptedRegistrationAccessToken,
				registrationAccessPurpose(registration.id),
			);
		}
		return true;
	} catch {
		return false;
	}
}

function accessModeOf(value: "READ_ONLY" | "READ_WRITE"): AccessMode {
	return value === "READ_ONLY" ? "read_only" : "read_write";
}

export function assertGrantedScopeBounds(
	platformSlug: string,
	accessMode: "READ_ONLY" | "READ_WRITE",
	granted: readonly string[],
): void {
	const vendor = vendorBySlug(platformSlug);
	if (!vendor)
		throw new BadRequestException("The MCP platform is unavailable.");
	const readScopes = new Set(vendor.access.read_only.scopes);
	const writeOnlyScopes = vendor.access.read_write.scopes.filter(
		(scope) => !readScopes.has(scope),
	);
	if (
		accessMode === "READ_ONLY" &&
		writeOnlyScopes.some((scope) => granted.includes(scope))
	) {
		throw new BadRequestException(
			"The MCP platform granted unexpected access.",
		);
	}
}

function dateFromSeconds(value: number | null): Date | null {
	if (!value) return null;
	const milliseconds = value > 100_000_000_000 ? value : value * 1_000;
	const date = new Date(milliseconds);
	return Number.isNaN(date.getTime()) ? null : date;
}

@Injectable()
export class McpConnectionsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly oauth: McpOAuthClient,
		private readonly agent: AgentTriggerService,
	) {}

	async list(userId: string) {
		const [role, connections, agentRows] = await Promise.all([
			workspaceRoleOf(userId, this.db),
			this.db.mcpConnection.findMany({
				where: { organizationId: WORKSPACE_ID },
				select: {
					platformSlug: true,
					status: true,
					accessMode: true,
					grantedScopes: true,
					connectedAt: true,
					lastSuccessfulCallAt: true,
					lastErrorCode: true,
				},
			}),
			this.db.agentDefinition.findMany({
				where: {
					status: { in: ["LIVE", "PAUSED"] },
					deletedAt: null,
					currentVersionId: { not: null },
				},
				orderBy: { updatedAt: "desc" },
				select: {
					id: true,
					name: true,
					description: true,
					status: true,
					currentVersion: { select: { manifest: true } },
				},
			}),
		]);
		const bySlug = new Map(
			connections.map((entry) => [entry.platformSlug, entry]),
		);
		const agentsByPlatform = agentsByMcpPlatform(agentRows);

		return {
			configured: createMcpSecretBox() !== undefined,
			canManage: canManageConnections(role),
			entries: vendors.map((vendor) => {
				const connection = bySlug.get(vendor.slug);
				return {
					slug: vendor.slug,
					name: vendor.name,
					resource: vendor.mcp.resource,
					readOnlyScopes: [...vendor.access.read_only.scopes],
					readWriteScopes: [...vendor.access.read_write.scopes],
					agents: agentsByPlatform.get(vendor.slug) ?? [],
					connection: connection
						? {
								...connection,
								status: STATUS[connection.status],
								accessMode: accessModeOf(connection.accessMode),
							}
						: null,
				};
			}),
		};
	}

	async get(userId: string, platformSlug: string) {
		const list = await this.list(userId);
		const entry = list.entries.find(
			(candidate) => candidate.slug === platformSlug,
		);
		if (!entry)
			throw new NotFoundException("The MCP platform is not supported.");
		return entry;
	}

	async start(userId: string, input: McpStartInput) {
		await this.assertManager(userId);
		const box = createMcpSecretBox();
		if (!box) {
			throw new ServiceUnavailableException(
				"MCP connections are not configured.",
			);
		}

		const vendor = vendorBySlug(input.platformSlug);
		if (!vendor)
			throw new NotFoundException("The MCP platform is not supported.");

		const access = vendorAccess(vendor, input.accessMode);
		const server = await this.oauth.discover(vendor);
		const metadataFingerprint = fingerprint(server);
		const registration = await this.registration(
			vendor,
			metadataFingerprint,
			server,
			vendor.access.read_write.scopes,
		);
		const pkce = createPkce();
		const rawState = randomBytes(32).toString("base64url");
		const hash = stateHash(rawState);

		await this.db.$transaction(async (tx) => {
			await tx.mcpConnection.upsert({
				where: {
					organizationId_platformSlug: {
						organizationId: WORKSPACE_ID,
						platformSlug: vendor.slug,
					},
				},
				create: {
					organizationId: WORKSPACE_ID,
					platformSlug: vendor.slug,
					status: "CONNECTING",
					accessMode: ACCESS_MODE[input.accessMode],
					grantedScopes: [],
					registrationId: registration.id,
					connectedById: userId,
				},
				update: {
					status: "CONNECTING",
					accessMode: ACCESS_MODE[input.accessMode],
					registrationId: registration.id,
					connectedById: userId,
					lastErrorCode: null,
				},
			});
			await tx.mcpOauthState.create({
				data: {
					stateHash: hash,
					organizationId: WORKSPACE_ID,
					userId,
					platformSlug: vendor.slug,
					accessMode: ACCESS_MODE[input.accessMode],
					returnPath: input.returnPath,
					encryptedCodeVerifier: box.encrypt(pkce.verifier, statePurpose(hash)),
					registrationId: registration.id,
					expiresAt: new Date(Date.now() + MCP_AUTH.state.expiresMs),
				},
			});
		});

		const authorizationUrl = new URL(server.authorizationEndpoint);
		const authorizationParameters = new URLSearchParams({
			response_type: "code",
			client_id: registration.clientId,
			redirect_uri: this.callbackUrl(),
			state: rawState,
			resource: vendor.mcp.resource,
			scope: access.scopes.join(" "),
			code_challenge: pkce.challenge,
			code_challenge_method: "S256",
		});
		if (vendor.auth.consentPrompt) {
			authorizationParameters.set("prompt", "consent");
		}
		authorizationUrl.search = authorizationParameters.toString();

		return { authorizationUrl: authorizationUrl.toString() };
	}

	async reconnect(userId: string, input: McpStartInput) {
		await this.assertManager(userId);
		const connection = await this.db.mcpConnection.findUnique({
			where: {
				organizationId_platformSlug: {
					organizationId: WORKSPACE_ID,
					platformSlug: input.platformSlug,
				},
			},
			select: { id: true },
		});
		if (!connection) {
			throw new NotFoundException("The MCP platform is not connected.");
		}
		return this.start(userId, input);
	}

	async tools(userId: string, platformSlug: string) {
		await workspaceRoleOf(userId, this.db);
		const connection = await this.db.mcpConnection.findUnique({
			where: {
				organizationId_platformSlug: {
					organizationId: WORKSPACE_ID,
					platformSlug,
				},
			},
			select: {
				status: true,
				toolSnapshots: {
					orderBy: { createdAt: "desc" },
					select: {
						name: true,
						description: true,
						fingerprint: true,
						callKind: true,
						reviewState: true,
						lastSeenAt: true,
					},
				},
			},
		});
		const latest = new Map<
			string,
			NonNullable<typeof connection>["toolSnapshots"][number]
		>();
		for (const tool of connection?.toolSnapshots ?? []) {
			if (!latest.has(tool.name)) latest.set(tool.name, tool);
		}

		return {
			connected: connection?.status === "CONNECTED",
			tools: [...latest.values()].map((tool) => ({
				...tool,
				callKind:
					tool.callKind === "read" ||
					tool.callKind === "change" ||
					tool.callKind === "risky"
						? tool.callKind
						: "risky",
				reviewState: tool.reviewState.toLowerCase() as
					| "pending"
					| "reviewed"
					| "changed"
					| "removed",
			})),
		};
	}

	async reviewTools(
		userId: string,
		platformSlug: string,
		tools: readonly { name: string; fingerprint: string }[],
	) {
		await this.assertManager(userId);
		const connection = await this.db.mcpConnection.findUnique({
			where: {
				organizationId_platformSlug: {
					organizationId: WORKSPACE_ID,
					platformSlug,
				},
			},
			select: { id: true, status: true },
		});
		if (connection?.status !== "CONNECTED") {
			throw new NotFoundException("The MCP connection is not active.");
		}

		const count = await this.db.$transaction(async (tx) => {
			let total = 0;
			for (const tool of tools) {
				const result = await tx.mcpToolSnapshot.updateMany({
					where: {
						connectionId: connection.id,
						name: tool.name,
						fingerprint: tool.fingerprint,
						reviewState: "PENDING",
					},
					data: { reviewState: "REVIEWED" },
				});
				total += result.count;
			}
			if (total !== tools.length) {
				throw new BadRequestException("The MCP tool inventory changed.");
			}
			return total;
		});
		return { reviewed: count };
	}

	async callback(input: CallbackInput): Promise<string> {
		await this.assertManager(input.userId);
		const box = createMcpSecretBox();
		if (!box)
			throw new ServiceUnavailableException(
				"MCP connections are not configured.",
			);

		const hash = stateHash(input.state);
		const state = await this.db.mcpOauthState.findUnique({
			where: { stateHash: hash },
			include: { registration: true },
		});
		if (
			!state ||
			state.userId !== input.userId ||
			state.consumedAt ||
			state.expiresAt.getTime() <= Date.now()
		) {
			throw new BadRequestException("The MCP authorization state is invalid.");
		}

		const consumed = await this.db.mcpOauthState.updateMany({
			where: { id: state.id, consumedAt: null, expiresAt: { gt: new Date() } },
			data: { consumedAt: new Date() },
		});
		if (consumed.count !== 1) {
			throw new BadRequestException(
				"The MCP authorization state was already used.",
			);
		}

		const vendor = vendorBySlug(state.platformSlug);
		if (!vendor)
			throw new BadRequestException("The MCP platform is unavailable.");
		const server = await this.oauth.discover(vendor);
		if (
			fingerprint(server) !== state.registration.metadataFingerprint ||
			(input.issuer && input.issuer !== server.issuer)
		) {
			throw new BadRequestException("The MCP authorization server changed.");
		}

		const clientSecret = state.registration.encryptedClientSecret
			? decryptAuthorizationValue(
					box,
					state.registration.encryptedClientSecret,
					registrationPurpose(state.registration.id),
				)
			: null;
		const tokens = await this.oauth.exchangeCode(
			server,
			{
				clientId: state.registration.clientId,
				clientSecret,
			},
			{
				code: input.code,
				verifier: decryptAuthorizationValue(
					box,
					state.encryptedCodeVerifier,
					statePurpose(state.stateHash),
				),
				redirectUri: this.callbackUrl(),
				resource: vendor.mcp.resource,
			},
		);

		const requested = vendorAccess(
			vendor,
			accessModeOf(state.accessMode),
		).scopes;
		const granted = tokens.scope?.split(/\s+/).filter(Boolean) ?? [
			...requested,
		];
		assertGrantedScopeBounds(vendor.slug, state.accessMode, granted);

		const connection = await this.db.mcpConnection.findUniqueOrThrow({
			where: {
				organizationId_platformSlug: {
					organizationId: WORKSPACE_ID,
					platformSlug: vendor.slug,
				},
			},
			select: { id: true },
		});
		await this.db.$transaction([
			this.db.mcpConnection.update({
				where: { id: connection.id },
				data: {
					status: "CONNECTING",
					grantedScopes: granted,
					encryptedAccessToken: box.encrypt(
						tokens.accessToken,
						tokenPurpose(connection.id, "access"),
					),
					encryptedRefreshToken: tokens.refreshToken
						? box.encrypt(
								tokens.refreshToken,
								tokenPurpose(connection.id, "refresh"),
							)
						: null,
					tokenExpiresAt: new Date(
						Date.now() +
							(tokens.expiresIn
								? tokens.expiresIn * 1_000
								: MCP_AUTH.token.unknownExpiryMs),
					),
					connectedAt: new Date(),
					lastErrorCode: null,
				},
			}),
			this.db.agentTask.create({
				data: {
					kind: "mcp-tool-discovery",
					reason: `Discover ${vendor.name} MCP tools after connection`,
					payload: { connectionId: connection.id, platformSlug: vendor.slug },
					priority: PRIORITY.mcpDiscovery,
					budget: 1,
					dueAt: new Date(),
					subject: connection.id,
				},
			}),
		]);
		this.agent.mcpToolDiscoveryQueued();

		return new URL(state.returnPath, appUrl).toString();
	}

	async failCallback(rawState: string, userId: string): Promise<void> {
		const state = await this.db.mcpOauthState.findUnique({
			where: { stateHash: stateHash(rawState) },
			select: { userId: true, platformSlug: true },
		});
		if (!state || state.userId !== userId) return;

		await this.db.mcpConnection.updateMany({
			where: {
				organizationId: WORKSPACE_ID,
				platformSlug: state.platformSlug,
				status: "CONNECTING",
			},
			data: { status: "ERROR", lastErrorCode: "oauth_callback_failed" },
		});
	}

	async disconnect(userId: string, platformSlug: string) {
		await this.assertManager(userId);
		const connection = await this.db.mcpConnection.findUnique({
			where: {
				organizationId_platformSlug: {
					organizationId: WORKSPACE_ID,
					platformSlug,
				},
			},
			include: { registration: true },
		});
		if (!connection)
			throw new NotFoundException("The MCP platform is not connected.");

		const box = createMcpSecretBox();
		const vendor = vendorBySlug(platformSlug);
		let revocationErrorCode: string | null = null;
		if (box && vendor && connection.encryptedAccessToken) {
			try {
				const server = await this.oauth.discover(vendor);
				await this.oauth.revoke(
					server,
					{
						clientId: connection.registration.clientId,
						clientSecret: connection.registration.encryptedClientSecret
							? box.decrypt(
									connection.registration.encryptedClientSecret,
									registrationPurpose(connection.registration.id),
								)
							: null,
					},
					box.decrypt(
						connection.encryptedAccessToken,
						tokenPurpose(connection.id, "access"),
					),
				);
			} catch (error) {
				revocationErrorCode =
					error instanceof McpOAuthError
						? `revocation_${error.failure}`
						: "revocation_failed";
			}
		}

		await this.db.$transaction([
			this.db.mcpConnection.update({
				where: { id: connection.id },
				data: {
					status: "DISCONNECTED",
					encryptedAccessToken: null,
					encryptedRefreshToken: null,
					tokenExpiresAt: null,
					lastErrorCode: revocationErrorCode,
				},
			}),
			this.db.mcpToolSnapshot.updateMany({
				where: { connectionId: connection.id },
				data: { reviewState: "REMOVED" },
			}),
		]);

		return { disconnected: true as const };
	}

	async token(connectionId: string) {
		const box = createMcpSecretBox();
		if (!box) {
			throw new ServiceUnavailableException(
				"MCP connections are not configured.",
			);
		}

		const connection = await this.db.mcpConnection.findUnique({
			where: { id: connectionId },
			include: { registration: true },
		});
		if (
			!connection?.encryptedAccessToken ||
			(connection.status !== "CONNECTING" && connection.status !== "CONNECTED")
		) {
			throw new NotFoundException("The MCP connection is not active.");
		}

		const currentToken = box.decrypt(
			connection.encryptedAccessToken,
			tokenPurpose(connection.id, "access"),
		);
		const expiresAt = connection.tokenExpiresAt?.getTime() ?? null;
		if (!expiresAt || expiresAt > Date.now() + MCP_AUTH.token.refreshMarginMs) {
			return { token: currentToken, expiresAt };
		}
		if (!connection.encryptedRefreshToken) {
			await this.markReauthRequired(connection.id, "refresh_token_missing");
			throw new ServiceUnavailableException(
				"The MCP connection needs authorization.",
			);
		}

		const vendor = vendorBySlug(connection.platformSlug);
		if (!vendor) {
			await this.markReauthRequired(connection.id, "platform_removed");
			throw new ServiceUnavailableException("The MCP platform is unavailable.");
		}

		try {
			const server = await this.oauth.discover(vendor);
			if (fingerprint(server) !== connection.registration.metadataFingerprint) {
				throw new Error("authorization_server_changed");
			}
			const refreshed = await this.oauth.refresh(
				server,
				{
					clientId: connection.registration.clientId,
					clientSecret: connection.registration.encryptedClientSecret
						? box.decrypt(
								connection.registration.encryptedClientSecret,
								registrationPurpose(connection.registration.id),
							)
						: null,
				},
				box.decrypt(
					connection.encryptedRefreshToken,
					tokenPurpose(connection.id, "refresh"),
				),
				vendor.mcp.resource,
			);
			const nextExpiresAt = refreshed.expiresIn
				? new Date(Date.now() + refreshed.expiresIn * 1_000)
				: null;
			await this.db.mcpConnection.update({
				where: { id: connection.id },
				data: {
					encryptedAccessToken: box.encrypt(
						refreshed.accessToken,
						tokenPurpose(connection.id, "access"),
					),
					encryptedRefreshToken: refreshed.refreshToken
						? box.encrypt(
								refreshed.refreshToken,
								tokenPurpose(connection.id, "refresh"),
							)
						: connection.encryptedRefreshToken,
					tokenExpiresAt: nextExpiresAt,
					lastErrorCode: null,
				},
			});
			return {
				token: refreshed.accessToken,
				expiresAt: nextExpiresAt?.getTime() ?? null,
			};
		} catch (error) {
			const code = error instanceof Error ? error.message : "refresh_failed";
			const latest = await this.db.mcpConnection.findUnique({
				where: { id: connection.id },
				select: {
					status: true,
					encryptedAccessToken: true,
					tokenExpiresAt: true,
				},
			});
			if (
				latest?.encryptedAccessToken &&
				latest.encryptedAccessToken !== connection.encryptedAccessToken &&
				(latest.status === "CONNECTING" || latest.status === "CONNECTED")
			) {
				return {
					token: box.decrypt(
						latest.encryptedAccessToken,
						tokenPurpose(connection.id, "access"),
					),
					expiresAt: latest.tokenExpiresAt?.getTime() ?? null,
				};
			}

			const reauthorizationRequired =
				code === "authorization_server_changed" ||
				(error instanceof McpOAuthError &&
					(error.failure === "invalid_client" ||
						error.failure === "invalid_grant"));
			if (reauthorizationRequired) {
				await this.markReauthRequired(connection.id, code);
				throw new ServiceUnavailableException(
					"The MCP connection needs authorization.",
				);
			}

			await this.db.mcpConnection.update({
				where: { id: connection.id },
				data: { lastErrorCode: code.slice(0, 120) },
			});
			throw new ServiceUnavailableException(
				"The MCP connection is temporarily unavailable.",
			);
		}
	}

	private async registration(
		vendor: Vendor,
		metadataFingerprint: string,
		server: Awaited<ReturnType<McpOAuthClient["discover"]>>,
		scopes: readonly string[],
	) {
		const existing = await this.db.mcpClientRegistration.findUnique({
			where: {
				platformSlug_metadataFingerprint: {
					platformSlug: vendor.slug,
					metadataFingerprint,
				},
			},
		});
		const box = createMcpSecretBox();
		if (!box)
			throw new ServiceUnavailableException(
				"MCP connections are not configured.",
			);
		if (
			existing &&
			(!existing.clientSecretExpiresAt ||
				existing.clientSecretExpiresAt > new Date()) &&
			registrationIsReadable(box, existing)
		) {
			return existing;
		}

		const registered = await this.oauth.register(
			server,
			this.callbackUrl(),
			scopes,
		);
		const id = existing?.id ?? randomUUID();

		return this.db.mcpClientRegistration.upsert({
			where: {
				platformSlug_metadataFingerprint: {
					platformSlug: vendor.slug,
					metadataFingerprint,
				},
			},
			create: {
				id,
				platformSlug: vendor.slug,
				metadataFingerprint,
				issuer: server.issuer,
				clientId: registered.clientId,
				encryptedClientSecret: registered.clientSecret
					? box.encrypt(registered.clientSecret, registrationPurpose(id))
					: null,
				encryptedRegistrationAccessToken: registered.registrationAccessToken
					? box.encrypt(
							registered.registrationAccessToken,
							registrationAccessPurpose(id),
						)
					: null,
				clientIdIssuedAt: dateFromSeconds(registered.clientIdIssuedAt),
				clientSecretExpiresAt: dateFromSeconds(
					registered.clientSecretExpiresAt,
				),
			},
			update: {
				issuer: server.issuer,
				clientId: registered.clientId,
				encryptedClientSecret: registered.clientSecret
					? box.encrypt(registered.clientSecret, registrationPurpose(id))
					: null,
				encryptedRegistrationAccessToken: registered.registrationAccessToken
					? box.encrypt(
							registered.registrationAccessToken,
							registrationAccessPurpose(id),
						)
					: null,
				clientIdIssuedAt: dateFromSeconds(registered.clientIdIssuedAt),
				clientSecretExpiresAt: dateFromSeconds(
					registered.clientSecretExpiresAt,
				),
			},
		});
	}

	private callbackUrl(): string {
		return new URL("/api/mcp/callback", apiUrl).toString();
	}

	private async markReauthRequired(
		connectionId: string,
		code: string,
	): Promise<void> {
		await this.db.mcpConnection.update({
			where: { id: connectionId },
			data: { status: "ERROR", lastErrorCode: code.slice(0, 120) },
		});
	}

	private async assertManager(userId: string): Promise<void> {
		const role = await workspaceRoleOf(userId, this.db);
		if (!canManageConnections(role)) {
			throw new ForbiddenException(
				"Only an owner or an admin can manage MCP connections.",
			);
		}
	}
}
