import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { SlackChannelsService } from "../src/slack/slack-channels.service";

const service = new SlackChannelsService();
const realFetch = globalThis.fetch;
const realSecret = process.env.AGENT_BRIDGE_SECRET;

function agentAnswers(status: number, body: string | null) {
	globalThis.fetch = (async (_url: unknown, _init?: RequestInit) =>
		new Response(body, {
			status,
			headers: { "content-type": "application/json" },
		})) as typeof fetch;
}

beforeEach(() => {
	process.env.AGENT_BRIDGE_SECRET = "slack-channel-test";
});

afterEach(() => {
	globalThis.fetch = realFetch;
	if (realSecret === undefined) {
		delete process.env.AGENT_BRIDGE_SECRET;
	} else {
		process.env.AGENT_BRIDGE_SECRET = realSecret;
	}
});

describe("creating a Slack channel", () => {
	it("returns the channel the agent created", async () => {
		agentAnswers(200, JSON.stringify({ channel: { id: "C1", name: "deals" } }));

		expect(await service.create("deals", false)).toEqual({
			channel: { id: "C1", name: "deals" },
		});
	});

	it("reports an agent outage as an outage, not as a bad request", async () => {
		agentAnswers(502, "<html>Bad Gateway</html>");

		await expect(service.create("deals", false)).rejects.toThrow(
			"The agent failed, so the channel was not created.",
		);
	});

	it("reports an unreadable answer as an outage", async () => {
		agentAnswers(200, "not json at all");

		await expect(service.create("deals", false)).rejects.toThrow(
			"The agent answered with something unreadable, so the channel was not created.",
		);
	});

	it("tells the caller what Slack refused", async () => {
		agentAnswers(422, JSON.stringify({ error: "That name is taken." }));

		await expect(service.create("deals", false)).rejects.toThrow(
			"That name is taken.",
		);
	});

	it("says nothing can reach Slack without a bridge secret", async () => {
		delete process.env.AGENT_BRIDGE_SECRET;

		await expect(service.create("deals", false)).rejects.toThrow(
			"This install has no AGENT_BRIDGE_SECRET, so nothing can reach Slack.",
		);
	});
});
