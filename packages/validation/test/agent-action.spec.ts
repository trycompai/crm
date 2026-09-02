import { describe, expect, it } from "bun:test";
import { InvalidInput, parse, schemas } from "../src/index";

describe("AgentAction result", () => {
	it("keeps invite_id and url on a Slack Connect invitation", () => {
		expect(
			parse(
				schemas.agentAction.result,
				{
					type: "slack.channel.invite",
					invite_id: "I1",
					url: "https://slack.com/invite/x",
					email: "buyer@customer.test",
					kind: "connect",
				},
				"This agent action result",
			),
		).toEqual({
			type: "slack.channel.invite",
			invite_id: "I1",
			url: "https://slack.com/invite/x",
			email: "buyer@customer.test",
			kind: "connect",
		});
	});

	it("keeps a member invitation that Slack never gave an id", () => {
		expect(
			parse(
				schemas.agentAction.result,
				{
					type: "slack.channel.invite",
					email: "rep@ours.test",
					kind: "member",
				},
				"This agent action result",
			),
		).toEqual({
			type: "slack.channel.invite",
			email: "rep@ours.test",
			kind: "member",
		});
	});

	it("stores the Slack message channel and ts", () => {
		expect(
			parse(
				schemas.agentAction.result,
				{ type: "slack.message.post", channel: "C1", ts: "1.2" },
				"This agent action result",
			),
		).toEqual({ type: "slack.message.post", channel: "C1", ts: "1.2" });
	});

	it("stores the opened channel id", () => {
		expect(
			parse(
				schemas.agentAction.result,
				{ type: "slack.channel.open", channelId: "C1" },
				"This agent action result",
			),
		).toEqual({ type: "slack.channel.open", channelId: "C1" });
	});

	it("stores the created activity id", () => {
		expect(
			parse(
				schemas.agentAction.result,
				{ type: "crm.activity.create", activityId: "act-1" },
				"This agent action result",
			),
		).toEqual({ type: "crm.activity.create", activityId: "act-1" });
	});

	it("reads a missing result as null", () => {
		expect(
			parse(schemas.agentAction.storedResult, null, "This agent action result"),
		).toBeNull();
	});

	it("rejects a Connect invitation that names nobody", () => {
		expect(() =>
			parse(
				schemas.agentAction.result,
				{ type: "slack.channel.invite", kind: "connect" },
				"This agent action result",
			),
		).toThrow(InvalidInput);
	});
});
