import { z } from "zod";

export const slackJoinChannelInput = z.object({
	channelId: z.string().trim().min(1).max(64),
});

export type SlackJoinChannelInput = z.infer<typeof slackJoinChannelInput>;
