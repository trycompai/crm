import { z } from "zod";
import { slackDestination } from "./agent-manifest";

export const permissions = [
	{ id: "post", label: "Post a message" },
	{ id: "mention", label: "Mention the deal owner" },
	{ id: "thread", label: "Reply in a thread" },
	{ id: "history", label: "Read the channel history" },
] as const;

export type Permission = (typeof permissions)[number]["id"];

export const defaultPermissions: Permission[] = ["post", "mention"];

export const permission = z.enum(
	permissions.map((entry) => entry.id) as [Permission, ...Permission[]],
);

export const handoffChannel = z.object({
	id: z.string().trim().min(1).max(64),
	name: z.string().trim().min(1).max(120),
	isMember: z.boolean(),
});

export const handoff = z.object({
	name: z.string().trim().min(1, "Give the agent a name.").max(120),
	job: z.string().trim().min(1, "Say what the agent should do.").max(20_000),
	channel: handoffChannel.nullable(),
	allowed: z.array(permission).max(permissions.length),
});

export type Handoff = z.infer<typeof handoff>;
export type HandoffChannel = z.infer<typeof handoffChannel>;

export const inputOption = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	description: z.string().optional(),
	style: z.enum(["primary", "danger", "default"]).optional(),
});

export const inputRequestAction = z.object({
	kind: z.literal("tool-call"),
	callId: z.string().min(1),
	toolName: z.string().min(1),
	input: z.record(z.string(), z.json()),
});

export const inputRequest = z.object({
	kind: z.enum(["question", "session-limit", "tool-approval"]),
	requestId: z.string().min(1),
	prompt: z.string().trim().min(1),
	action: inputRequestAction,
	display: z.enum(["confirmation", "select", "text"]).optional(),
	options: z.array(inputOption).optional(),
	allowFreeform: z.boolean().optional(),
});

export const inputRequested = z.object({
	requests: z.array(inputRequest),
	sequence: z.number().int().nonnegative(),
	stepIndex: z.number().int().nonnegative(),
	turnId: z.string().min(1),
});

export type InputOption = z.infer<typeof inputOption>;
export type InputRequest = z.infer<typeof inputRequest>;
export type InputRequested = z.infer<typeof inputRequested>;

export const capabilityAction = z.object({
	type: z.string().trim().min(1).max(120),
	provider: z.string().trim().min(1).max(60),
	summary: z.string().trim().max(400).default(""),
	destination: slackDestination.optional(),
});

export const CAPABILITY_RESOURCE_IDS = {
	gmail: "google:gmail",
	calendar: "google:calendar",
	slack: "slack:workspace",
} as const;

export const capabilityResource = z.object({
	id: z.string().trim().min(1).max(160),
	kind: z.enum(["company", "contact", "deal", "integration"]),
	label: z.string().trim().min(1).max(160),
});

export const capabilities = z.object({
	actions: z.array(capabilityAction),
	dataScope: z.object({
		mode: z.enum(["SELECTED", "WORKSPACE"]),
		summary: z.string().trim().max(400).default(""),
		resources: z.array(capabilityResource).default([]),
	}),
});

export type Capabilities = z.infer<typeof capabilities>;
export type CapabilityAction = z.infer<typeof capabilityAction>;
export type CapabilityResource = z.infer<typeof capabilityResource>;
