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
	channel: z
		.object({
			id: z.string().trim().min(1),
			name: z.string().trim().min(1),
		})
		.optional(),
});

export const reply = z.object({
	ok: z.boolean(),
	error: z.string().optional(),
});

export const lookupByEmail = reply.extend({
	user: z.object({ id: z.string().trim().min(1) }).nullish(),
});

export const inviteShared = reply.extend({
	invite_id: z.string().trim().min(1).optional(),
	url: z.string().trim().min(1).optional(),
});

export const authTest = reply.extend({
	user_id: z.string().trim().min(1).optional(),
});

const present = z.string().min(1).optional().catch(undefined);

export const oauthAccess = z
	.object({
		ok: z.boolean().catch(false),
		error: present,
		access_token: present,
		token_type: present,
		scope: z.string().optional().catch(undefined),
		team: z
			.object({
				id: z.string().trim().min(1),
				name: z.string().trim().min(1).optional(),
			})
			.optional()
			.catch(undefined),
		authed_user: z
			.object({
				id: z.string().trim().min(1),
				access_token: z.string().trim().min(1).optional(),
				scope: z.string().trim().optional(),
			})
			.optional()
			.catch(undefined),
	})
	.catch({ ok: false });

export const userInfo = z
	.object({
		ok: z.boolean().catch(false),
		user: z
			.object({
				name: present,
				profile: z
					.object({
						email: present,
						real_name: present,
						image_512: present,
					})
					.catch({}),
			})
			.catch({ profile: {} }),
	})
	.catch({ ok: false, user: { profile: {} } });

export type CreatePayload = z.infer<typeof createPayload>;
export type JoinPayload = z.infer<typeof joinPayload>;
export type Reply = z.infer<typeof reply>;
export type AuthTest = z.infer<typeof authTest>;
export type OauthAccess = z.infer<typeof oauthAccess>;
