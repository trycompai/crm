import { db, type Prisma } from "@crm/db";
import { vendorAccess, vendorBySlug } from "@crm/mcp-integrations/catalog";
import {
	classifyTool,
	mcpToolSchema,
	toolFingerprint,
} from "@crm/mcp-integrations/tool";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { MCP } from "./mcp-config";
import { mcpConnectionToken } from "./mcp-token";

const discoveryPayload = z.object({
	connectionId: z.string().min(1),
	platformSlug: z.string().min(1),
});

const toolsReply = z.object({
	tools: z.array(mcpToolSchema).max(MCP.discovery.maxTools),
});

export async function runMcpToolDiscovery(
	payload: Prisma.JsonValue | null,
): Promise<string> {
	const input = discoveryPayload.parse(payload);
	const vendor = vendorBySlug(input.platformSlug);
	if (!vendor) throw new Error("The MCP platform is unavailable.");

	const connection = await db.mcpConnection.findUnique({
		where: { id: input.connectionId },
		select: { id: true, platformSlug: true, status: true, accessMode: true },
	});
	if (
		!connection ||
		connection.platformSlug !== vendor.slug ||
		(connection.status !== "CONNECTING" && connection.status !== "CONNECTED")
	) {
		throw new Error("The MCP connection is not active.");
	}

	try {
		const token = await mcpConnectionToken(connection.id);
		const mode =
			connection.accessMode === "READ_ONLY" ? "read_only" : "read_write";
		const tools = await listTools(vendorAccess(vendor, mode).url, token.token);
		await storeTools(connection.id, vendor, tools);
		await db.mcpConnection.update({
			where: { id: connection.id },
			data: {
				status: "CONNECTED",
				lastSuccessfulCallAt: new Date(),
				lastErrorCode: null,
			},
		});
		return `Discovered ${tools.length} ${vendor.name} MCP tools.`;
	} catch (error) {
		const message = error instanceof Error ? error.message : "discovery_failed";
		await db.mcpConnection.update({
			where: { id: connection.id },
			data: { status: "ERROR", lastErrorCode: message.slice(0, 120) },
		});
		throw error;
	}
}

async function listTools(url: string, token: string) {
	const client = new Client({ name: "crm-agent", version: "1.0.0" });
	const transport = new StreamableHTTPClientTransport(new URL(url), {
		requestInit: {
			headers: { authorization: `Bearer ${token}` },
		},
	});

	try {
		await client.connect(transport);
		return toolsReply.parse(await client.listTools()).tools;
	} finally {
		await client.close().catch(() => undefined);
	}
}

async function storeTools(
	connectionId: string,
	vendor: NonNullable<ReturnType<typeof vendorBySlug>>,
	tools: z.infer<typeof toolsReply>["tools"],
): Promise<void> {
	const existing = await db.mcpToolSnapshot.findMany({
		where: { connectionId },
		orderBy: { createdAt: "desc" },
	});
	const latest = new Map<string, (typeof existing)[number]>();
	for (const snapshot of existing) {
		if (!latest.has(snapshot.name)) latest.set(snapshot.name, snapshot);
	}
	const seen = new Set(tools.map((tool) => tool.name));
	const now = new Date();

	await db.$transaction(async (tx) => {
		for (const tool of tools) {
			const fingerprint = toolFingerprint(tool);
			const previous = latest.get(tool.name);
			if (previous?.fingerprint === fingerprint) {
				await tx.mcpToolSnapshot.update({
					where: { id: previous.id },
					data: {
						lastSeenAt: now,
						reviewState:
							previous.reviewState === "REMOVED" ? "PENDING" : undefined,
					},
				});
				continue;
			}

			await tx.mcpToolSnapshot.updateMany({
				where: {
					connectionId,
					name: tool.name,
					reviewState: { not: "REMOVED" },
				},
				data: { reviewState: "CHANGED" },
			});
			await tx.mcpToolSnapshot.upsert({
				where: {
					connectionId_name_fingerprint: {
						connectionId,
						name: tool.name,
						fingerprint,
					},
				},
				create: {
					connectionId,
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema,
					annotations: tool.annotations,
					fingerprint,
					callKind: classifyTool(vendor, tool),
					reviewState: "PENDING",
					lastSeenAt: now,
				},
				update: {
					description: tool.description,
					inputSchema: tool.inputSchema,
					annotations: tool.annotations,
					callKind: classifyTool(vendor, tool),
					reviewState: "PENDING",
					lastSeenAt: now,
				},
			});
		}

		await tx.mcpToolSnapshot.updateMany({
			where: {
				connectionId,
				name: { notIn: [...seen] },
				reviewState: { not: "REMOVED" },
			},
			data: { reviewState: "REMOVED" },
		});
	});
}
