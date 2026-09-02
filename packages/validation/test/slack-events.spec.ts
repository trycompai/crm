import { describe, expect, it } from "bun:test";
import {
	eventCallback,
	isActionable,
	isFromApp,
	SLACK_EVENT_TYPES,
	type SlackEvent,
	slackEnvelope,
} from "../src/slack-events";

const joined = {
	type: "event_callback",
	event_id: "Ev123",
	team_id: "T1",
	event: {
		type: SLACK_EVENT_TYPES.MEMBER_JOINED,
		channel: "C1",
		user: "U1",
	},
};

const message = (over: Partial<SlackEvent> = {}) => ({
	type: SLACK_EVENT_TYPES.MESSAGE,
	channel: "C1",
	user: "U1",
	text: "org_abc123",
	ts: "1700000000.000100",
	...over,
});

describe("the envelope Slack posts", () => {
	it("reads the setup handshake", () => {
		const parsed = slackEnvelope.parse({
			type: "url_verification",
			challenge: "abc",
		});

		expect(parsed).toEqual({ type: "url_verification", challenge: "abc" });
	});

	it("reads a member-joined callback", () => {
		const parsed = eventCallback.parse(joined);

		expect(parsed.event.channel).toBe("C1");
		expect(parsed.event_id).toBe("Ev123");
	});

	it("refuses a callback with no event id, so nothing is deduplicated by luck", () => {
		expect(eventCallback.safeParse({ ...joined, event_id: "" }).success).toBe(
			false,
		);
	});

	it("keeps an unknown event type rather than dropping the delivery", () => {
		const parsed = eventCallback.parse({
			...joined,
			event: { type: "reaction_added", channel: "C1" },
		});

		expect(parsed.event.type).toBe("reaction_added");
	});
});

describe("isFromApp", () => {
	it("recognises our own bot, so an agent cannot answer itself", () => {
		expect(isFromApp({ type: "message", bot_id: "B1" })).toBe(true);
		expect(isFromApp({ type: "message", subtype: "bot_message" })).toBe(true);
	});

	it("treats a human message as a human message", () => {
		expect(isFromApp(message())).toBe(false);
	});
});

describe("isActionable", () => {
	it("acts on a member joining", () => {
		expect(isActionable(joined.event)).toBe(true);
	});

	it("acts on a plain human message with text", () => {
		expect(isActionable(message())).toBe(true);
	});

	it("ignores our own bot posting, which would otherwise loop", () => {
		expect(isActionable(message({ bot_id: "B1" }))).toBe(false);
		expect(isActionable(message({ subtype: "bot_message" }))).toBe(false);
	});

	it("ignores edits, joins-as-message and other subtypes", () => {
		expect(isActionable(message({ subtype: "message_changed" }))).toBe(false);
		expect(isActionable(message({ subtype: "channel_join" }))).toBe(false);
	});

	it("ignores an empty message", () => {
		expect(isActionable(message({ text: "" }))).toBe(false);
		expect(isActionable(message({ text: "   " }))).toBe(false);
	});

	it("acts on a mention, which is how somebody asks the agent for help", () => {
		expect(
			isActionable({ type: "app_mention", channel: "C1", text: "<@U1> help" }),
		).toBe(true);
	});

	it("ignores a mention with no words after it", () => {
		expect(
			isActionable({ type: "app_mention", channel: "C1", text: " " }),
		).toBe(false);
	});

	it("ignores a mention our own bot posted", () => {
		expect(
			isActionable({
				type: "app_mention",
				channel: "C1",
				text: "<@U1> hi",
				bot_id: "B1",
			}),
		).toBe(false);
	});

	it("ignores event types we do not handle", () => {
		expect(isActionable({ type: "reaction_added", channel: "C1" })).toBe(false);
	});
});
