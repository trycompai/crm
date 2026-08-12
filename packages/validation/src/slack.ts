import { z } from "zod";

export const joinPayload = z.object({
	type: z.literal("slack.channel.join"),
	channelId: z.string().trim().min(1).max(64),
	channelName: z.string().trim().min(1).max(120),
});

export const createPayload = z.object({
	type: z.literal("slack.channel.create"),
	channelName: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.regex(/^[a-z0-9-_]+$/, "Use lowercase letters, numbers and dashes."),
	isPrivate: z.boolean(),
});

export const createReply = z.object({
	ok: z.boolean(),
	error: z.string().optional(),
	channel: z.object({ id: z.string(), name: z.string() }).optional(),
});

export const reply = z.object({
	ok: z.boolean(),
	error: z.string().optional(),
});

export const authTest = reply.extend({
	user_id: z.string().trim().min(1).optional(),
});

export const installation = z.object({
	team: z.object({
		id: z.string().trim().min(1),
		name: z.string().trim().min(1).optional(),
	}),
	authed_user: z
		.object({
			id: z.string().trim().min(1),
			access_token: z.string().trim().min(1).optional(),
			scope: z.string().trim().optional(),
		})
		.optional(),
});

export type CreatePayload = z.infer<typeof createPayload>;
export type JoinPayload = z.infer<typeof joinPayload>;
export type Reply = z.infer<typeof reply>;
export type AuthTest = z.infer<typeof authTest>;
export type Installation = z.infer<typeof installation>;
