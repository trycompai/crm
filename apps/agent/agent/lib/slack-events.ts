import { db, type Prisma } from "@crm/db";
import type { SlackEvent } from "@crm/validation";
import { schemas } from "@crm/validation";
import { SLACK_EVENT_TYPES } from "@crm/validation/slack-events";
import type { SendFn } from "eve/channels";
import { resumeAgentRun, runOnSlackChannel } from "./run-resume";
import { SLACK_EVENTS } from "./slack-events-config";

export type SlackEventOutcome = {
	eventId: string;
	resumed: boolean;
	outcome: string;
};

type ClaimedSlackEvent = {
	id: string;
	eventId: string;
	channelId: string | null;
	payload: Prisma.JsonValue;
};

export async function pendingSlackEventIds(): Promise<string[]> {
	const now = new Date();
	const rows = await db.slackEventInbox.findMany({
		where: {
			processedAt: null,
			OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
		},
		orderBy: { receivedAt: "asc" },
		take: SLACK_EVENTS.batch,
		select: { id: true },
	});

	return rows.map((row) => row.id);
}

async function claimSlackEvent(id: string): Promise<ClaimedSlackEvent | null> {
	const now = new Date();
	const until = new Date(now.getTime() + SLACK_EVENTS.leaseMs);

	const claimed = await db.$queryRaw<ClaimedSlackEvent[]>`
		UPDATE "slackEventInbox" AS t
		SET "leasedUntil" = ${until}
		FROM (
			SELECT t2.id FROM "slackEventInbox" AS t2
			WHERE t2.id = ${id}
				AND t2."processedAt" IS NULL
				AND (t2."leasedUntil" IS NULL OR t2."leasedUntil" < ${now})
			FOR UPDATE SKIP LOCKED
		) AS due
		WHERE t.id = due.id
		RETURNING t.id, t."eventId", t."channelId", t.payload;
	`;

	return claimed[0] ?? null;
}

export async function dispatchSlackEvent(
	id: string,
	send: SendFn,
): Promise<SlackEventOutcome | null> {
	const row = await claimSlackEvent(id);

	if (!row) return null;

	const settle = (outcome: string, resumed = false) =>
		db.slackEventInbox
			.updateMany({
				where: { id: row.id, processedAt: null },
				data: { processedAt: new Date(), outcome: outcome.slice(0, 300) },
			})
			.then(() => ({ eventId: row.eventId, resumed, outcome }));

	if (!row.channelId) return settle("The event names no channel.");

	const envelope = schemas.slackEvents.eventCallback.safeParse(row.payload);
	if (!envelope.success) return settle("The stored payload cannot be read.");

	const runId = await runOnSlackChannel(row.channelId);
	if (!runId) {
		return settle(`No live agent run owns ${row.channelId}.`);
	}

	const result = await resumeAgentRun(
		{
			runId,
			message: describe(envelope.data.event),
			source: `slack.${envelope.data.event.type}`,
			attributes: {
				slackChannelId: row.channelId,
				slackEventId: row.eventId,
			},
		},
		send,
	);

	if (result.kind === "resumed") {
		await db.slackEventInbox.updateMany({
			where: { id: row.id },
			data: { runId },
		});
		return settle(`Resumed run ${runId}.`, true);
	}

	return settle(`Run ${runId} was not resumed: ${result.reason}`);
}

export async function drainSlackEvents(send: SendFn): Promise<number> {
	const ids = await pendingSlackEventIds();
	let resumed = 0;

	for (const id of ids) {
		const outcome = await dispatchSlackEvent(id, send).catch((error) => {
			console.error(
				`[agent] Slack event ${id} could not be dispatched: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return null;
		});

		if (outcome?.resumed) resumed += 1;
	}

	return resumed;
}

export function describe(event: SlackEvent): string {
	if (event.type === SLACK_EVENT_TYPES.MEMBER_JOINED) {
		return [
			`Somebody joined the Slack channel this run is working in (${event.channel}).`,
			event.user ? `Their Slack user id is ${event.user}.` : "",
			"Carry on from where you parked.",
		]
			.filter(Boolean)
			.join(" ");
	}

	const text = event.text?.trim() ?? "";

	if (event.type === SLACK_EVENT_TYPES.APP_MENTION) {
		return [
			`Somebody mentioned Comp AI in the Slack channel this run is working in (${event.channel})`,
			event.user ? ` from ${event.user}` : "",
			`: ${text.slice(0, SLACK_EVENTS.maxTextChars)}`,
		].join("");
	}

	return [
		`A message arrived in the Slack channel this run is working in (${event.channel})`,
		event.user ? ` from ${event.user}` : "",
		`: ${text.slice(0, SLACK_EVENTS.maxTextChars)}`,
	].join("");
}
