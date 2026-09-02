import { z } from "zod";

const trimmed = z.string().trim().min(1);

export const SLACK_EVENT_TYPES = {
	MEMBER_JOINED: "member_joined_channel",
	MESSAGE: "message",
	APP_MENTION: "app_mention",
} as const;

export const urlVerification = z.object({
	type: z.literal("url_verification"),
	challenge: trimmed,
});

export const slackEvent = z.object({
	type: trimmed,
	channel: z.string().trim().optional(),
	user: z.string().trim().optional(),
	text: z.string().optional(),
	ts: z.string().trim().optional(),
	thread_ts: z.string().trim().optional(),
	bot_id: z.string().trim().optional(),
	subtype: z.string().trim().optional(),
});

export const eventCallback = z.object({
	type: z.literal("event_callback"),
	event_id: trimmed,
	team_id: z.string().trim().optional(),
	event: slackEvent,
});

export const slackEnvelope = z.union([urlVerification, eventCallback]);

export const slackEventBody = z.record(z.string(), z.json());

export type SlackEventBody = z.infer<typeof slackEventBody>;

export function readSlackEventBody(body: string): SlackEventBody | null {
	try {
		const parsed = slackEventBody.safeParse(JSON.parse(body));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export type SlackEvent = z.infer<typeof slackEvent>;
export type EventCallback = z.infer<typeof eventCallback>;
export type SlackEnvelope = z.infer<typeof slackEnvelope>;

export function isFromApp(event: SlackEvent): boolean {
	return Boolean(event.bot_id) || event.subtype === "bot_message";
}

export function isActionable(event: SlackEvent): boolean {
	if (isFromApp(event)) return false;

	if (event.type === SLACK_EVENT_TYPES.MEMBER_JOINED) return true;
	if (event.type === SLACK_EVENT_TYPES.APP_MENTION) {
		return Boolean(event.text?.trim());
	}

	return (
		event.type === SLACK_EVENT_TYPES.MESSAGE &&
		event.subtype === undefined &&
		Boolean(event.text?.trim())
	);
}
