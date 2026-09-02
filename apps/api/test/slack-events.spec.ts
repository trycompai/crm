import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { signBody } from "@crm/auth";
import type { SlackEnvelope, SlackEvent } from "@crm/validation";
import { UnauthorizedException } from "@nestjs/common";
import express from "express";
import { SLACK } from "../src/slack/slack-config";
import {
	SLACK_EVENTS_PATH,
	SlackEventsController,
} from "../src/slack/slack-events.controller";
import { slackEventsBody } from "../src/slack/slack-events-body";

const secret = "test-signing-secret";

type Stored = {
	eventId: string;
	type: string;
	teamId?: string;
	channelId?: string;
	messageTs?: string;
};

const stored: Stored[] = [];
let nextResult = { stored: true };

const agent = {
	slackEventReceived: async (input: Stored) => {
		stored.push(input);
		return nextResult;
	},
} as never;

const config = {
	get: () => secret,
} as never;

const controller = new SlackEventsController(agent, config);

const post = (
	payload: SlackEnvelope | { type: string; nested?: { a: number } },
	over: { secret?: string; skew?: number } = {},
) => {
	const body = JSON.stringify(payload);
	const timestamp = String(Math.floor(Date.now() / 1000) + (over.skew ?? 0));
	const signature = signBody(body, timestamp, over.secret ?? secret);

	return controller.events(Buffer.from(body), timestamp, signature);
};

const callback = (event: SlackEvent, eventId = "Ev1") => ({
	type: "event_callback",
	event_id: eventId,
	team_id: "T1",
	event,
});

beforeEach(() => {
	stored.length = 0;
	nextResult = { stored: true };
});

describe("the Slack events endpoint", () => {
	it("answers Slack's setup handshake with the challenge", async () => {
		const result = await post({
			type: "url_verification",
			challenge: "abc123",
		});

		expect(result).toEqual({ challenge: "abc123" });
		expect(stored).toHaveLength(0);
	});

	it("stores a member-joined event for the agent to act on", async () => {
		await post(
			callback({ type: "member_joined_channel", channel: "C1", user: "U1" }),
		);

		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			eventId: "Ev1",
			type: "member_joined_channel",
			channelId: "C1",
			teamId: "T1",
		});
	});

	it("stores a human message", async () => {
		await post(
			callback({
				type: "message",
				channel: "C1",
				user: "U1",
				text: "org_abc123",
			}),
		);

		expect(stored).toHaveLength(1);
	});

	it("stores a mention, which is how somebody asks the agent for help", async () => {
		await post(
			callback({
				type: "app_mention",
				channel: "C1",
				user: "U1",
				text: "<@U9> where are we",
				ts: "1700000000.000100",
			}),
		);

		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			type: "app_mention",
			messageTs: "1700000000.000100",
		});
	});

	it("refuses a body that was not signed with our secret", async () => {
		const attempt = post(
			callback({ type: "member_joined_channel", channel: "C1" }),
			{ secret: "someone-elses-secret" },
		);

		await expect(attempt).rejects.toThrow(UnauthorizedException);
		expect(stored).toHaveLength(0);
	});

	it("refuses a replayed request from outside the window", async () => {
		const attempt = post(
			callback({ type: "member_joined_channel", channel: "C1" }),
			{ skew: -3600 },
		);

		await expect(attempt).rejects.toThrow(UnauthorizedException);
		expect(stored).toHaveLength(0);
	});

	it("ignores our own bot, which would otherwise talk to itself", async () => {
		await post(
			callback({
				type: "message",
				channel: "C1",
				text: "hello",
				bot_id: "B1",
			}),
		);

		expect(stored).toHaveLength(0);
	});

	it("ignores an event type we do not act on", async () => {
		await post(callback({ type: "reaction_added", channel: "C1" }));

		expect(stored).toHaveLength(0);
	});

	it("answers 200 for a redelivery rather than storing it twice", async () => {
		nextResult = { stored: false };

		const result = await post(
			callback({ type: "member_joined_channel", channel: "C1" }),
		);

		expect(result).toEqual({ ok: true });
	});

	it("answers 200 to a shape it cannot read, so Slack stops retrying", async () => {
		const result = await post({ type: "something_new", nested: { a: 1 } });

		expect(result).toEqual({ ok: true });
		expect(stored).toHaveLength(0);
	});

	it("answers 200 to a signed body that is not JSON at all", async () => {
		const body = "not json";
		const timestamp = String(Math.floor(Date.now() / 1000));

		const result = await controller.events(
			Buffer.from(body),
			timestamp,
			signBody(body, timestamp, secret),
		);

		expect(result).toEqual({ ok: true });
		expect(stored).toHaveLength(0);
	});

	it("refuses everything when no signing secret is configured", async () => {
		const unconfigured = new SlackEventsController(agent, {
			get: () => undefined,
		} as never);

		const body = JSON.stringify({ type: "url_verification", challenge: "x" });
		const timestamp = String(Math.floor(Date.now() / 1000));

		await expect(
			unconfigured.events(
				Buffer.from(body),
				timestamp,
				signBody(body, timestamp, secret),
			),
		).rejects.toThrow(UnauthorizedException);
	});
});

describe("the Slack events body cap", () => {
	let server: Server;
	let origin = "";

	beforeAll(async () => {
		const app = express();
		app.use(SLACK_EVENTS_PATH, slackEventsBody);
		app.post(SLACK_EVENTS_PATH, (request, response) => {
			response.json({
				bytes: Buffer.isBuffer(request.body) ? request.body.length : -1,
			});
		});

		server = app.listen(0);
		await new Promise((resolve) => server.once("listening", resolve));

		const { port } = server.address() as AddressInfo;
		origin = `http://127.0.0.1:${port}`;
	});

	afterAll(() => {
		server.close();
	});

	const send = (bytes: number) =>
		fetch(`${origin}${SLACK_EVENTS_PATH}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "x".repeat(bytes),
		});

	it("hands a body under the cap to the controller as a buffer", async () => {
		const response = await send(64);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ bytes: 64 });
	});

	it("refuses a body over the cap, so an unsigned stream cannot exhaust memory", async () => {
		const response = await send(SLACK.events.maxBodyBytes + 1);

		expect(response.status).toBe(413);
	});
});
