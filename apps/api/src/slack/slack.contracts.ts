import { z } from "zod";
import { SLACK } from "./slack-config";

export const slackChannelsInput = z.object({
	cursor: z.string().trim().min(1).max(64).nullish(),
	limit: z.number().int().min(1).max(SLACK.channels.maxPageSize).optional(),
	query: z.string().trim().max(120).optional(),
});

export type SlackChannelsInput = z.infer<typeof slackChannelsInput>;

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

export const slackCreateChannelReply = z.union([
	z.object({
		channel: z.object({
			id: z.string().trim().min(1).max(64),
			name: z.string().trim().min(1).max(120),
		}),
	}),
	z.object({ error: z.string().trim().min(1).max(500) }),
]);

export type SlackCreateChannelReply = z.infer<typeof slackCreateChannelReply>;
