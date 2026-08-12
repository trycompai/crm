import { db } from "@crm/db";
import {
	slackCanInviteItself,
	slackConnected,
} from "../../agent/lib/slack-connection";
import { runSlackChannelJoin } from "../../agent/lib/slack-join-task";
import { runSlackPeopleMatch } from "../../agent/lib/slack-people";
import { E2E } from "./e2e-config";

const JOINS_FOR_REAL = process.env.E2E_SLACK_JOIN === "1";
const SKIPPED =
	"skipped: set E2E_SLACK_JOIN=1 to change the real Slack workspace";

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

	if (!JOINS_FOR_REAL) {
		console.log(
			"NOTE  Comp AI joins no channel in this run. A join is permanent.",
		);
	}

	console.log(await runSlackPeopleMatch());

	const channels = await db.slackChannel.findMany({
		where: { available: true },
		select: { id: true, name: true, isPrivate: true, isMember: true },
	});
	const canInvite = await slackCanInviteItself();

	record(
		"inventory records privacy and membership",
		channels.length > 0,
		channels
			.map(
				(row) =>
					`${row.isPrivate ? "🔒" : "#"}${row.name}${row.isMember ? "[member]" : ""}`,
			)
			.join(" "),
	);

	const publicUnjoined = channels.find(
		(row) => !row.isPrivate && !row.isMember,
	);
	if (!publicUnjoined) {
		record(
			"joins a public channel",
			true,
			"skipped: Comp AI is already in every public channel",
		);
	} else if (!JOINS_FOR_REAL) {
		record("joins a public channel", true, SKIPPED);
	} else {
		const outcome = await runSlackChannelJoin({
			type: "slack.channel.join",
			channelId: publicUnjoined.id,
			channelName: publicUnjoined.name,
		});
		record("joins a public channel", outcome.includes("joined"), outcome);
	}

	const privateUnjoined = channels.find(
		(row) => row.isPrivate && !row.isMember,
	);
	if (!privateUnjoined) {
		record(
			"private channel behaves as the grant allows",
			true,
			"skipped: no private channel is visible to Comp AI",
		);
	} else if (!JOINS_FOR_REAL) {
		record("private channel behaves as the grant allows", true, SKIPPED);
	} else {
		const outcome = await runSlackChannelJoin({
			type: "slack.channel.join",
			channelId: privateUnjoined.id,
			channelName: privateUnjoined.name,
		});
		record(
			"private channel behaves as the grant allows",
			canInvite ? outcome.includes("joined") : outcome.includes("could not"),
			outcome,
		);
	}

	const bogus = await runSlackChannelJoin({
		type: "slack.channel.join",
		channelId: E2E.slackJoin.bogusChannelId,
		channelName: E2E.slackJoin.bogusChannelName,
	}).catch((error: unknown) =>
		error instanceof Error ? error.message : String(error),
	);
	record(
		"a channel that does not exist is refused",
		bogus.includes("could not") || bogus.includes("No such channel"),
		bogus,
	);

	let rejected = "";
	try {
		await runSlackChannelJoin({ type: "slack.channel.join" });
	} catch (error) {
		rejected = error instanceof Error ? error.message : String(error);
	}
	record(
		"an unreadable payload is a real error",
		rejected.includes("unreadable payload"),
		rejected || "no error thrown",
	);

	record(
		"workspace grant present",
		canInvite,
		canInvite
			? "a user token lets Comp AI add itself to a private channel"
			: "no user token, so Comp AI cannot add itself to a private channel",
	);

	const failed = results.filter((row) => !row.ok).length;
	console.log(
		failed === 0
			? `\nAll ${results.length} join checks passed.`
			: `\n${failed} of ${results.length} join checks failed.`,
	);
	process.exit(failed === 0 ? 0 : 1);
}

await main();
