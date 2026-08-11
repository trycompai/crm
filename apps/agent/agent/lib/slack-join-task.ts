import { z } from "zod";
import { joinSlackChannel } from "./slack-membership";

const slackJoinPayload = z.object({
	type: z.literal("slack.channel.join"),
	channelId: z.string().trim().min(1).max(64),
	channelName: z.string().trim().min(1).max(120),
});

export type SlackJoinPayload = z.infer<typeof slackJoinPayload>;

export class InvalidSlackJoinPayload extends Error {}

export function parseSlackJoinPayload(value: unknown): SlackJoinPayload {
	const parsed = slackJoinPayload.safeParse(value);
	if (!parsed.success) {
		throw new InvalidSlackJoinPayload(
			`A slack-channel-join task carries an unreadable payload: ${parsed.error.issues
				.map((issue) => `${issue.path.join(".")} ${issue.message}`)
				.join("; ")}`,
		);
	}
	return parsed.data;
}

export async function runSlackChannelJoin(value: unknown): Promise<string> {
	const { channelId, channelName } = parseSlackJoinPayload(value);
	const outcome = await joinSlackChannel(channelId);

	if (outcome.joined) {
		return outcome.already
			? `Comp AI was already in #${channelName}.`
			: `Comp AI joined #${channelName}.`;
	}

	return `Comp AI could not join #${channelName}. ${outcome.reason}`;
}
