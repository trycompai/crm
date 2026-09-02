import { SLACK } from "./slack-config";

export function toChannelName(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, SLACK.channel.maxNameChars)
		.replace(/-$/, "");
}
