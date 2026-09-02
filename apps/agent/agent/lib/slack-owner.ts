import { db } from "@crm/db";
import { schemas } from "@crm/validation";
import { runRecord } from "@crm/validation/agent-events";
import { slackPost } from "./slack-api";
import { slackAccessToken } from "./slack-connection";

export type OwnerInvite =
	| { added: true; slackUserId: string; name: string }
	| { added: false; reason: string };

export async function addDealOwner(
	runId: string,
	channelId: string,
): Promise<OwnerInvite | null> {
	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: { input: true },
	});

	const record = runRecord(run?.input);
	if (record?.kind !== "deal") return null;

	const deal = await db.deal.findUnique({
		where: { id: record.id },
		select: { owner: { select: { id: true, name: true } } },
	});
	if (!deal) return null;

	const match = await db.slackMemberMatch.findUnique({
		where: { crmUserId: deal.owner.id },
		select: { slackUserId: true },
	});
	if (!match?.slackUserId) {
		return {
			added: false,
			reason: `${deal.owner.name} has no matching Slack account.`,
		};
	}

	const token = await slackAccessToken();
	if (!token) return { added: false, reason: "Slack is not connected." };

	const outcome = await slackPost(
		token,
		"conversations.invite",
		{ channel: channelId, users: match.slackUserId },
		schemas.slack.reply,
	);

	if (outcome.ok || outcome.error === "already_in_channel") {
		return {
			added: true,
			slackUserId: match.slackUserId,
			name: deal.owner.name,
		};
	}

	return {
		added: false,
		reason: `Slack refused to add ${deal.owner.name} (${outcome.error}).`,
	};
}
