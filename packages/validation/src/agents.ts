import { z } from "zod";

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
