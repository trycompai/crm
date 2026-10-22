import { createHash } from "node:crypto";
import { db, type Prisma } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { vendorAccess, vendorBySlug } from "@crm/mcp-integrations/catalog";
import { parseAgentManifest } from "@crm/validation/agent-manifest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ApprovalContext, ApprovalStatus } from "eve/tools/approval";
import { z } from "zod";
import { permissionModeOf } from "./approval";
import { MCP } from "./mcp-config";
import { mcpConnectionToken } from "./mcp-token";
import { attribute, purposeOf } from "./session-purpose";

const mcpToolArguments = z.record(z.string(), z.json());

export const mcpActionResultEvent = z.object({
	status: z.enum(["completed", "failed", "cancelled"]),
	result: z.object({
		kind: z.literal("tool-result"),
		callId: z.string().min(1),
		toolName: z.string().min(1),
	}),
	error: z
		.object({ message: z.string().min(1).max(2_000) })
		.nullable()
		.optional(),
});

export function capMcpArchivedResult(
	type: string,
	data: Prisma.InputJsonObject,
): Prisma.InputJsonObject {
	if (type !== "action.result") return data;
	const parsed = mcpActionResultEvent.safeParse(data);
	if (!parsed.success || !parsed.data.result.toolName.includes("__"))
		return data;

	const serialized = JSON.stringify(data);
	const originalBytes = Buffer.byteLength(serialized);
	if (originalBytes <= MCP.result.archiveMaxBytes) return data;

	const retainedText = Buffer.from(serialized)
		.subarray(0, MCP.result.archiveRetainedBytes)
		.toString("utf8")
		.replace(/\uFFFD$/, "");

	return {
		...data,
		result: {
			...parsed.data.result,
			output: {
				truncated: true,
				originalBytes,
				retainedText,
			},
		},
	};
}

export function mcpModelOutput(output: Prisma.JsonValue) {
	const serialized = JSON.stringify(output);
	const originalBytes = Buffer.byteLength(serialized);
	if (originalBytes <= MCP.result.modelMaxBytes) {
		return { type: "json" as const, value: output };
	}

	const retainedText = Buffer.from(serialized)
		.subarray(0, MCP.result.modelRetainedBytes)
		.toString("utf8")
		.replace(/\uFFFD$/, "");

	return {
		type: "json" as const,
		value: {
			truncated: true,
			originalBytes,
			retainedText,
		},
	};
}

export async function callMcpTool(input: {
	connectionId: string;
	platformSlug: string;
	toolName: string;
	arguments: z.infer<typeof mcpToolArguments>;
}): Promise<Prisma.JsonValue> {
	const vendor = vendorBySlug(input.platformSlug);
	if (!vendor) throw new Error("The MCP platform is unavailable.");
	const connection = await db.mcpConnection.findUnique({
		where: { id: input.connectionId },
		select: { status: true, accessMode: true },
	});
	if (connection?.status !== "CONNECTED") {
		throw new Error("The MCP platform is disconnected.");
	}
	const mode =
		connection.accessMode === "READ_ONLY" ? "read_only" : "read_write";
	const token = await mcpConnectionToken(input.connectionId);
	const client = new Client({ name: "crm-agent", version: "1.0.0" });
	const transport = new StreamableHTTPClientTransport(
		new URL(vendorAccess(vendor, mode).url),
		{
			requestInit: {
				headers: { authorization: `Bearer ${token.token}` },
			},
		},
	);

	try {
		await client.connect(transport);
		return z.json().parse(
			await client.callTool({
				name: input.toolName,
				arguments: input.arguments,
			}),
		);
	} finally {
		await client.close().catch(() => undefined);
	}
}

export async function authorizeMcpTool(
	platformSlug: string,
	context: ApprovalContext,
): Promise<ApprovalStatus> {
	if (purposeOf(context) !== "team-agent") {
		return {
			type: "denied",
			reason: "Only deployed agents can use MCP tools.",
		};
	}
	const runId = attribute(context, "runId");
	if (!runId) return { type: "denied", reason: "The agent run is missing." };
	const toolName = bareToolName(platformSlug, context.toolName);
	if (!toolName)
		return { type: "denied", reason: "The MCP tool name is invalid." };

	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: {
			agentId: true,
			version: { select: { manifest: true } },
		},
	});
	if (!run) return { type: "denied", reason: "The agent run is unavailable." };
	const manifest = parseAgentManifest(run.version.manifest);
	const grant = manifest.mcp.find(
		(entry) => entry.platformSlug === platformSlug,
	);
	const tool = grant?.tools.find((entry) => entry.name === toolName);
	if (!tool)
		return { type: "denied", reason: "This agent lacks that MCP tool grant." };

	const connection = await db.mcpConnection.findUnique({
		where: {
			organizationId_platformSlug: {
				organizationId: WORKSPACE_ID,
				platformSlug,
			},
		},
		select: {
			id: true,
			status: true,
			accessMode: true,
			toolSnapshots: {
				where: {
					name: toolName,
					fingerprint: tool.fingerprint,
					reviewState: "REVIEWED",
				},
				select: { id: true },
				take: 1,
			},
		},
	});
	if (connection?.status !== "CONNECTED") {
		return { type: "denied", reason: "The MCP platform is disconnected." };
	}
	if (connection.toolSnapshots.length !== 1) {
		return { type: "denied", reason: "The MCP tool changed after deployment." };
	}
	if (connection.accessMode === "READ_ONLY" && tool.callKind !== "read") {
		return { type: "denied", reason: "The MCP connection is read-only." };
	}
	const permissionMode = permissionModeOf(context);
	if (
		(permissionMode === "manual" && tool.callKind !== "read") ||
		(permissionMode === "auto" && tool.callKind === "risky")
	) {
		return "user-approval";
	}
	if (tool.callKind === "read") return "approved";

	const idempotencyKey = `${runId}:${context.callId}`;
	const existing = await db.agentAction.findUnique({
		where: { idempotencyKey },
		select: { id: true },
	});
	if (existing) {
		return { type: "denied", reason: "This MCP change already ran." };
	}
	await db.agentAction.create({
		data: {
			agentId: run.agentId,
			runId,
			type: "mcp.tool.call",
			provider: platformSlug,
			targetType: "mcp-tool",
			targetId: tool.name,
			targetLabel: tool.name,
			summary: tool.summary,
			metadata: {
				toolName: tool.name,
				callKind: tool.callKind,
				fingerprint: tool.fingerprint,
			},
			status: "RUNNING",
			idempotencyKey,
			requestHash: createHash("sha256")
				.update(`${platformSlug}:${tool.name}:${context.callId}`)
				.digest("hex"),
			attemptCount: 1,
			startedAt: new Date(),
		},
	});

	return "approved";
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
