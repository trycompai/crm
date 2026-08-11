import { z } from "zod";

export const slackJoinChannelInput = z.object({
	channelId: z.string().trim().min(1).max(64),
});

export type SlackJoinChannelInput = z.infer<typeof slackJoinChannelInput>;

export const slackCreateChannelInput = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.regex(/^[a-z0-9-_]+$/, "Use lowercase letters, numbers and dashes."),
	isPrivate: z.boolean().default(false),
});

export type SlackCreateChannelInput = z.infer<typeof slackCreateChannelInput>;
