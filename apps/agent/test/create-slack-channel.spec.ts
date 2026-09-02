import { describe, expect, it } from "bun:test";
import {
	agentManifest,
	type SlackDestination,
} from "@crm/validation/agent-manifest";
import { toChannelName } from "../agent/lib/slack-channel-name";

const manifestWith = (destination: SlackDestination) => ({
	actions: [
		{
			type: "slack.message.post",
			provider: "slack",
			summary: "Tell the channel",
			destination,
		},
		{ type: "run.summary", provider: "crm", summary: "Say what happened" },
	],
	triggers: [
		{ type: "MANUAL", name: "Run now", summary: "Run on demand", config: {} },
	],
	dataScope: {
		mode: "WORKSPACE",
		summary: "Workspace CRM records",
		resources: [{ kind: "integration", id: "slack:workspace", label: "Slack" }],
	},
});

describe("create_slack_channel", () => {
	it("returns a destination the manifest accepts as chosen", () => {
		const created = { id: "C0BU8QXQPFG", name: "notifications-crm-closed-won" };
		const destination = {
			kind: "channel" as const,
			resolution: "chosen" as const,
			id: created.id,
			label: `#${created.name}`,
		};

		const parsed = agentManifest.safeParse(manifestWith(destination));

		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.actions[0]).toMatchObject({ destination });
		}
	});

	it("normalises the name it sends to Slack", () => {
		expect(toChannelName("Notifications: CRM Closed Won!")).toBe(
			"notifications-crm-closed-won",
		);
	});

	it("refuses a name with nothing Slack accepts", () => {
		expect(toChannelName("!!!")).toBe("");
	});
});
