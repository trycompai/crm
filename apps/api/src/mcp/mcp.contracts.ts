import { z } from "zod";

const mcpAccessMode = z.enum(["read_only", "read_write"]);

const mcpConnectionState = z.object({
	status: z.enum(["connecting", "connected", "error", "disconnected"]),
	accessMode: mcpAccessMode,
	grantedScopes: z.array(z.string()),
	connectedAt: z.date().nullable(),
	lastSuccessfulCallAt: z.date().nullable(),
	lastErrorCode: z.string().nullable(),
});

const mcpCatalogEntry = z.object({
	slug: z.string(),
	name: z.string(),
	resource: z.url(),
	readOnlyScopes: z.array(z.string()),
	readWriteScopes: z.array(z.string()),
	agents: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			description: z.string().nullable(),
			status: z.enum(["LIVE", "PAUSED"]),
		}),
	),
	connection: mcpConnectionState.nullable(),
});

export const mcpListOutput = z.object({
	configured: z.boolean(),
	canManage: z.boolean(),
	entries: z.array(mcpCatalogEntry),
});

export const mcpStartInput = z.object({
	platformSlug: z.string().trim().min(1),
	accessMode: mcpAccessMode,
	returnPath: z
		.string()
		.startsWith("/")
		.refine((value) => !value.startsWith("//"), "Return path must stay local"),
});

export const mcpStartOutput = z.object({ authorizationUrl: z.url() });

export const mcpGetInput = z.object({
	platformSlug: z.string().trim().min(1),
});

export const mcpGetOutput = mcpCatalogEntry;

export const mcpReconnectInput = z.object({
	platformSlug: z.string().trim().min(1),
	accessMode: mcpAccessMode,
	returnPath: z
		.string()
		.startsWith("/")
		.refine((value) => !value.startsWith("//"), "Return path must stay local"),
});

export const mcpReconnectOutput = z.object({ authorizationUrl: z.url() });

export const mcpDisconnectInput = z.object({
	platformSlug: z.string().trim().min(1),
});

export const mcpDisconnectOutput = z.object({ disconnected: z.literal(true) });

export const mcpToolsInput = z.object({
	platformSlug: z.string().trim().min(1),
});

const mcpToolEntry = z.object({
	name: z.string(),
	description: z.string().nullable(),
	fingerprint: z.string(),
	callKind: z.enum(["read", "change", "risky"]),
	reviewState: z.enum(["pending", "reviewed", "changed", "removed"]),
	lastSeenAt: z.date(),
});

export const mcpToolsOutput = z.object({
	connected: z.boolean(),
	tools: z.array(mcpToolEntry),
});

export const mcpReviewToolsInput = z.object({
	platformSlug: z.string().trim().min(1),
	tools: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(256),
				fingerprint: z.string().length(64),
			}),
		)
		.min(1)
		.max(1_000),
});

export const mcpReviewToolsOutput = z.object({
	reviewed: z.number().int().nonnegative(),
});

export type McpStartInput = z.infer<typeof mcpStartInput>;
