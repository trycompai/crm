import { db } from "@crm/db";
import { agentManifest } from "@crm/validation/agent-manifest";
import { toChannelName } from "../../agent/lib/slack-channel-name";
import {
	slackCanInviteItself,
	slackConnected,
} from "../../agent/lib/slack-connection";
import { createSlackChannel } from "../../agent/lib/slack-membership";
import { refreshSlackChannels } from "../../agent/lib/slack-people";
import { E2E } from "./e2e-config";

const CREATES_FOR_REAL = process.env.E2E_SLACK_CREATE === "1";
const PRIVATE = process.env.E2E_SLACK_CREATE_PRIVATE === "1";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function main() {
	if (!(await slackConnected())) {
		console.error("FAIL  Slack is not connected. Nothing to test.");
		process.exit(1);
	}

	const requested = `${E2E.channelCreate.namePrefix}${Date.now()}`;
	const name = toChannelName(requested);

	record(
		"the requested name normalises to something Slack accepts",
		name.length > 0 && name === name.toLowerCase() && !name.includes(" "),
		`${requested} -> ${name}`,
	);

	if (!CREATES_FOR_REAL) {
		console.log(
			"\nNOTE  No channel was created. A Slack channel cannot be deleted, only archived.",
		);
		console.log(
			"      Set E2E_SLACK_CREATE=1 to create one for real in the connected workspace.",
		);
		process.exit(results.some((row) => !row.ok) ? 1 : 0);
	}

	if (PRIVATE && !(await slackCanInviteItself())) {
		record(
			"a private channel needs the workspace user token",
			false,
			"no user token, so Slack will refuse conversations.create for a private channel",
		);
	}

	const outcome = await createSlackChannel(name, PRIVATE);
	if ("error" in outcome) {
		record("Slack created the channel", false, outcome.error);
		summarise();
		return;
	}

	record(
		"Slack created the channel",
		outcome.id.startsWith("C"),
		`${outcome.id} #${outcome.name}`,
	);

	record(
		"Slack kept the normalised name",
		outcome.name === name,
		`asked for #${name}, got #${outcome.name}`,
	);

	const destination = {
		kind: "channel" as const,
		resolution: "chosen" as const,
		id: outcome.id,
		label: `#${outcome.name}`,
	};
	const parsed = agentManifest.safeParse({
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
			resources: [
				{ kind: "integration", id: "slack:workspace", label: "Slack" },
			],
		},
	});
	record(
		"the returned destination is a manifest a version can hold",
		parsed.success,
		parsed.success ? "parses as a chosen destination" : "manifest rejected it",
	);

	await db.slackChannel.delete({ where: { id: outcome.id } });
	await refreshSlackChannels();
	const cached = await db.slackChannel.findUnique({
		where: { id: outcome.id },
		select: { id: true, name: true, isMember: true },
	});
	record(
		"the inventory refresh picked it up",
		cached !== null,
		cached
			? `cached as #${cached.name}, isMember=${cached.isMember}`
			: "not in slackChannel after refreshSlackChannels()",
	);

	record(
		"the bot is a member of what it created",
		cached?.isMember === true,
		cached?.isMember
			? "it can post without joining first"
			: "created but not joined, so a post would fail",
	);

	console.log(
		`\nNOTE  #${outcome.name} still exists in Slack. Archive it by hand; the API cannot delete a channel.`,
	);
	summarise();
}

function summarise() {
	const failed = results.filter((row) => !row.ok).length;
	console.log(
		failed === 0
			? `\nAll ${results.length} channel-create checks passed.`
			: `\n${failed} of ${results.length} channel-create checks failed.`,
	);
	process.exit(failed === 0 ? 0 : 1);
}

await main();
