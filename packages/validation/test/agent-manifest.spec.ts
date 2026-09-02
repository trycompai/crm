import { describe, expect, it } from "bun:test";
import { parseAgentManifest } from "../src/agent-manifest";

const slackResource = {
	kind: "integration" as const,
	id: "slack:workspace",
	label: "Slack",
};

const base = {
	triggers: [
		{
			type: "MANUAL" as const,
			name: "Run now",
			summary: "Run on demand",
			config: {},
		},
	],
	dataScope: {
		mode: "WORKSPACE" as const,
		summary: "Workspace CRM records",
		resources: [slackResource],
	},
};

const summaryAction = {
	type: "run.summary" as const,
	provider: "crm" as const,
	summary: "Say what happened",
};

describe("agent manifest Slack destinations", () => {
	it("parses a run-channel destination", () => {
		expect(
			parseAgentManifest({
				...base,
				actions: [
					{
						type: "slack.message.post",
						provider: "slack",
						summary: "Greet them in the channel this run opened",
						destination: { kind: "channel", resolution: "run-channel" },
					},
					summaryAction,
				],
			}).actions,
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "slack.message.post",
					destination: { kind: "channel", resolution: "run-channel" },
				}),
			]),
		);
	});

	it("parses a chosen destination", () => {
		expect(
			parseAgentManifest({
				...base,
				actions: [
					{
						type: "slack.message.post",
						provider: "slack",
						summary: "Tell sales",
						destination: {
							kind: "channel",
							resolution: "chosen",
							id: "C123",
							label: "#sales",
						},
					},
					summaryAction,
				],
			}).actions,
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "slack.message.post",
					destination: {
						kind: "channel",
						resolution: "chosen",
						id: "C123",
						label: "#sales",
					},
				}),
			]),
		);
	});

	it("parses the onboarding post destination as run-channel", () => {
		const manifest = parseAgentManifest({
			...base,
			actions: [
				{
					type: "slack.channel.open",
					provider: "slack",
					summary: "Open the customer channel",
				},
				{
					type: "slack.channel.invite",
					provider: "slack",
					summary: "Invite the buyer",
				},
				{
					type: "slack.message.post",
					provider: "slack",
					summary: "Greet them in the channel this run opened",
					destination: { kind: "channel", resolution: "run-channel" },
				},
				summaryAction,
			],
		});

		const post = manifest.actions.find(
			(action) => action.type === "slack.message.post",
		);
		expect(post?.destination).toEqual({
			kind: "channel",
			resolution: "run-channel",
		});
	});

	it("rejects two slack.message.post actions", () => {
		expect(() =>
			parseAgentManifest({
				...base,
				actions: [
					{
						type: "slack.message.post",
						provider: "slack",
						summary: "Greet them in the channel this run opened",
						destination: { kind: "channel", resolution: "run-channel" },
					},
					{
						type: "slack.message.post",
						provider: "slack",
						summary: "Tell sales",
						destination: {
							kind: "channel",
							resolution: "chosen",
							id: "C123",
							label: "#sales",
						},
					},
					summaryAction,
				],
			}),
		).toThrow("Duplicate slack.message.post action");
	});

	it("rejects a chosen destination without resolution", () => {
		expect(() =>
			parseAgentManifest({
				...base,
				actions: [
					{
						type: "slack.message.post",
						provider: "slack",
						summary: "Tell sales",
						destination: {
							kind: "channel",
							id: "C123",
							label: "#sales",
						},
					},
					summaryAction,
				],
			}),
		).toThrow();
	});

	it("rejects a run-channel destination that is not a channel", () => {
		expect(() =>
			parseAgentManifest({
				...base,
				actions: [
					{
						type: "slack.message.post",
						provider: "slack",
						summary: "Greet them",
						destination: { kind: "user", resolution: "run-channel" },
					},
					summaryAction,
				],
			}),
		).toThrow();
	});
});
