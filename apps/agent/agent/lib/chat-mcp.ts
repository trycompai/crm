import { db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { vendorAccess } from "@crm/mcp-integrations/catalog";
import type { Vendor } from "@crm/mcp-integrations/vendor";
import type { AgentConnectionRequestStatus } from "@crm/validation/agent-connection-request";
import {
	ConnectionAuthorizationFailedError,
	ConnectionAuthorizationRequiredError,
	type ConnectionPrincipal,
	type DynamicConnectionSet,
	defineMcpClientConnection,
} from "eve/connections";
import type {
	ApprovalConfiguration,
	ApprovalContext,
	ApprovalStatus,
} from "eve/tools/approval";
import { z } from "zod";
import { permissionModeOf } from "./approval";
import { mcpConnectionToken } from "./mcp-token";
import { attribute, purposeOf } from "./session-purpose";

const toolCallKind = z.enum(["read", "change", "risky"]);

type ChatMcpConnection = {
	id: string;
	platformSlug: string;
	status: "CONNECTING" | "CONNECTED" | "ERROR" | "DISCONNECTED";
	accessMode: "READ_ONLY" | "READ_WRITE";
	lastErrorCode: string | null;
	toolSnapshots: readonly {
		name: string;
		callKind: "read" | "change" | "risky";
	}[];
};

const REAUTH_ERROR_CODES = new Set([
	"authorization_server_changed",
	"invalid_client",
	"invalid_grant",
	"platform_removed",
	"refresh_token_missing",
]);

export function connectionRequestStatus(
	connection: Pick<ChatMcpConnection, "status" | "lastErrorCode"> | null,
): AgentConnectionRequestStatus {
	if (!connection || connection.status === "DISCONNECTED") {
		return "not_connected";
	}
	if (connection.status === "CONNECTED") return "connected";
	if (
		connection.status === "ERROR" &&
		connection.lastErrorCode &&
		REAUTH_ERROR_CODES.has(connection.lastErrorCode)
	) {
		return "needs_reauth";
	}
	return "error";
}

export function chatCallApprovalStatus(
	callKind: "read" | "change" | "risky",
	accessMode: "READ_ONLY" | "READ_WRITE",
	permissionMode: "manual" | "auto" | "bypass" | null,
): ApprovalStatus {
	if (accessMode === "READ_ONLY" && callKind !== "read") {
		return { type: "denied", reason: "The MCP connection is read-only." };
	}
	if (permissionMode === "manual" && callKind !== "read") {
		return "user-approval";
	}
	if (permissionMode === "auto" && callKind === "risky") {
		return "user-approval";
	}
	if (permissionMode === "bypass" && callKind === "risky") {
		return { type: "approved", reason: "risky" };
	}
	return "approved";
}

export async function loadChatMcpConnections(): Promise<ChatMcpConnection[]> {
	const connections = await db.mcpConnection.findMany({
		where: { organizationId: WORKSPACE_ID },
		select: {
			id: true,
			platformSlug: true,
			status: true,
			accessMode: true,
			lastErrorCode: true,
			toolSnapshots: {
				where: { reviewState: "REVIEWED" },
				select: { name: true, callKind: true },
			},
		},
	});
	return connections.map((connection) => ({
		...connection,
		toolSnapshots: connection.toolSnapshots.map((tool) => ({
			...tool,
			callKind: toolCallKind.parse(tool.callKind),
		})),
	}));
}

export function buildChatMcpConnections(
	vendors: readonly Vendor[],
	connections: readonly ChatMcpConnection[],
	userId: string,
): DynamicConnectionSet {
	const bySlug = new Map(
		connections.map((connection) => [connection.platformSlug, connection]),
	);

	return Object.fromEntries(
		vendors.map((vendor) => {
			const connection = bySlug.get(vendor.slug) ?? null;
			const mode =
				connection?.accessMode === "READ_WRITE" ? "read_write" : "read_only";
			const access = vendorAccess(vendor, mode);

			return [
				vendor.slug,
				defineMcpClientConnection({
					url: access.url,
					description: `${vendor.name}: ${vendor.presentation.description}`,
					instanceKey: connection
						? `${connection.id}:${mode}`
						: `${WORKSPACE_ID}:${vendor.slug}`,
					tools: {
						allow: connection?.toolSnapshots.map((tool) => tool.name) ?? [],
					},
					auth: {
						credentialOwner: "user",
						getToken: ({ principal }) =>
							chatMcpToken(vendor, connection, userId, principal),
					},
					approval: chatMcpApproval(vendor.slug, connection, userId),
				}),
			] as const;
		}),
	);
}

async function chatMcpToken(
	vendor: Vendor,
	connection: ChatMcpConnection | null,
	userId: string,
	principal: ConnectionPrincipal,
) {
	if (principal.type !== "user" || principal.id !== userId) {
		throw new ConnectionAuthorizationFailedError(vendor.slug, {
			reason: "principal_mismatch",
			retryable: false,
			message: `The ${vendor.name} connection belongs to another user.`,
		});
	}
	if (connection?.status !== "CONNECTED") {
		throw new ConnectionAuthorizationRequiredError(vendor.slug, {
			message: `${vendor.name} is not connected. Use the connection card.`,
		});
	}

	try {
		return await mcpConnectionToken(connection.id);
	} catch {
		const current = await db.mcpConnection.findUnique({
			where: { id: connection.id },
			select: { status: true },
		});
		if (current?.status !== "CONNECTED") {
			throw new ConnectionAuthorizationRequiredError(vendor.slug, {
				message: `${vendor.name} needs authorization. Use the connection card.`,
			});
		}
		throw new ConnectionAuthorizationFailedError(vendor.slug, {
			reason: "unavailable",
			retryable: false,
			message: `${vendor.name} is temporarily unavailable.`,
		});
	}
}

function chatMcpApproval(
	platformSlug: string,
	connection: ChatMcpConnection | null,
	userId: string,
): ApprovalConfiguration {
	return {
		request: async (context) =>
			authorizeChatMcpTool(platformSlug, connection, userId, context),
		response: ({ request, response }) => {
			if (
				request.principal &&
				request.principal.authenticator === response.principal.authenticator &&
				request.principal.principalId === response.principal.principalId &&
				request.principal.principalType === response.principal.principalType
			) {
				return { status: "allowed" };
			}
			return {
				status: "rejected",
				reason: "Only the person who requested this call can respond.",
			};
		},
	};
}

async function authorizeChatMcpTool(
	platformSlug: string,
	connection: ChatMcpConnection | null,
	userId: string,
	context: ApprovalContext,
): Promise<ApprovalStatus> {
	if (
		purposeOf(context) !== "builder" ||
		attribute(context, "commandType") !== "CHAT" ||
		attribute(context, "userId") !== userId ||
		context.session.auth.current?.principalId !== userId
	) {
		return {
			type: "denied",
			reason: "Only the signed-in chat owner can use connected tools.",
		};
	}
	if (connection?.status !== "CONNECTED") {
		return { type: "denied", reason: "The MCP platform is disconnected." };
	}
	const toolName = bareToolName(platformSlug, context.toolName);
	if (!toolName) {
		return { type: "denied", reason: "The MCP tool name is invalid." };
	}
	const current = await db.mcpConnection.findUnique({
		where: { id: connection.id },
		select: {
			status: true,
			accessMode: true,
			toolSnapshots: {
				where: { name: toolName, reviewState: "REVIEWED" },
				select: { callKind: true },
				take: 1,
			},
		},
	});
	if (current?.status !== "CONNECTED") {
		return { type: "denied", reason: "The MCP platform is disconnected." };
	}
	const tool = current.toolSnapshots[0];
	if (!tool) {
		return { type: "denied", reason: "This MCP tool is not reviewed." };
	}
	return chatCallApprovalStatus(
		toolCallKind.parse(tool.callKind),
		current.accessMode,
		permissionModeOf(context),
	);
}

function bareToolName(
	platformSlug: string,
	qualifiedName: string,
): string | null {
	const prefix = `${platformSlug}__`;
	return qualifiedName.startsWith(prefix)
		? qualifiedName.slice(prefix.length)
		: null;
}
