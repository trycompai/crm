import { db } from "@crm/db";
import { sendSlackMessage } from "../../agent/lib/run-runtime";
import { slackAccessToken } from "../../agent/lib/slack-connection";

type Case = {
	name: string;
	destination: { kind: "channel" | "user"; id: string; label: string };
	expect: "delivered" | "refused";
};

const stamp = new Date().toISOString().slice(11, 19);

async function main() {
	const token = await slackAccessToken();
	if (!token) {
		console.error("FAIL  Slack is not connected. Nothing to test.");
		process.exit(1);
	}

	const channels = await db.slackChannel.findMany({
		select: { id: true, name: true },
	});
	const people = await db.slackMemberMatch.findMany({
		where: { slackUserId: { not: null } },
		select: { slackUserId: true, slackHandle: true },
	});

	const testChannel = channels.find((row) => row.name === "test");
	const person = people[0];

	const cases: Case[] = [];

	if (testChannel) {
		cases.push({
			name: "channel message to a joined channel",
			destination: {
				kind: "channel",
				id: testChannel.id,
				label: `#${testChannel.name}`,
			},
			expect: "delivered",
		});
	}

	if (person?.slackUserId) {
		cases.push({
			name: "direct message to a matched person",
			destination: {
				kind: "user",
				id: person.slackUserId,
				label: person.slackHandle ?? "@unknown",
			},
			expect: "delivered",
		});
	}

	const unjoined = channels.find((row) => row.name === "test2");
	if (unjoined) {
		cases.push({
			name: "public channel the app has not joined",
			destination: {
				kind: "channel",
				id: unjoined.id,
				label: `#${unjoined.name}`,
			},
			expect: "delivered",
		});
	}

	cases.push({
		name: "channel that does not exist",
		destination: { kind: "channel", id: "C00NOTREAL99", label: "#missing" },
		expect: "refused",
	});

	let failures = 0;

	for (const item of cases) {
		const replayId = crypto.randomUUID();
		const text = `E2E ${stamp} — ${item.name}. Ignore this message.`;

		try {
			const result = await sendSlackMessage(
				token,
				item.destination,
				text,
				replayId,
			);
			const ok = item.expect === "delivered";
			console.log(
				`${ok ? "PASS" : "FAIL"}  ${item.name} — delivered ts=${result.ts}`,
			);
			if (!ok) failures += 1;
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			const ok = item.expect === "refused";
			console.log(`${ok ? "PASS" : "FAIL"}  ${item.name} — refused: ${reason}`);
			if (!ok) failures += 1;
		}
	}

	console.log(
		failures === 0
			? `\nAll ${cases.length} delivery cases behaved as expected.`
			: `\n${failures} of ${cases.length} cases did not behave as expected.`,
	);
	process.exit(failures === 0 ? 0 : 1);
}

await main();
