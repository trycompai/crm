import { parse, schemas } from "@crm/validation";
import { createSlackChannel } from "./slack-membership";

export async function runSlackChannelCreate(value: unknown): Promise<string> {
	const { channelName, isPrivate } = parse(
		schemas.slack.createPayload,
		value,
		"A slack-channel-create task carries an unreadable payload",
	);

	const outcome = await createSlackChannel(channelName, isPrivate);

	return "error" in outcome
		? `Could not create #${channelName}. ${outcome.error}`
		: `Created #${outcome.name}.`;
}
