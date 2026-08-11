import { db } from "@crm/db";
import { z } from "zod";
import { SLACK } from "./slack-config";
import { slackAccessToken, slackUserToken } from "./slack-connection";

const slackReply = z.object({
	ok: z.boolean(),
	error: z.string().optional(),
});

const authTest = slackReply.extend({
	user_id: z.string().trim().min(1).optional(),
});

export type JoinOutcome =
	| { joined: true; already: boolean }
	| { joined: false; reason: string; needsHuman: boolean };

const ALREADY_IN = ["already_in_channel", "is_archived"];

async function call(
	token: string,
	method: string,
	body: Record<string, string>,
	attempt = 1,
): Promise<{ ok: boolean; error?: string }> {
	const response = await fetch(`https://slack.com/api/${method}`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json; charset=utf-8",
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(SLACK.request.timeoutMs),
	});

	const parsed = slackReply.safeParse(await response.json());
	if (!parsed.success) return { ok: false, error: "unreadable_reply" };
	if (parsed.data.ok) return { ok: true };

	if (
		parsed.data.error === "ratelimited" &&
		attempt < SLACK.request.maxAttempts
	) {
		const wait = Number(response.headers.get("retry-after") ?? "1");
		await new Promise((resolve) =>
			setTimeout(resolve, wait * SLACK.request.retryUnitMs),
		);
		return call(token, method, body, attempt + 1);
	}

	return { ok: false, error: parsed.data.error };
}

async function botUserId(token: string): Promise<string | null> {
	const response = await fetch("https://slack.com/api/auth.test", {
		headers: { authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(SLACK.request.timeoutMs),
	});
	const parsed = authTest.safeParse(await response.json());
	return parsed.success && parsed.data.ok
		? (parsed.data.user_id ?? null)
		: null;
}

export async function joinSlackChannel(
	channelId: string,
): Promise<JoinOutcome> {
	const channel = await db.slackChannel.findUnique({
		where: { id: channelId },
		select: { id: true, isPrivate: true, isMember: true },
	});

	if (!channel) {
		return { joined: false, reason: "No such channel.", needsHuman: false };
	}
	if (channel.isMember) return { joined: true, already: true };

	const bot = await slackAccessToken();
	if (!bot) {
		return {
			joined: false,
			reason: "Slack is not connected.",
			needsHuman: true,
		};
	}

	const outcome = channel.isPrivate
		? await inviteWithUserToken(channelId, bot)
		: await call(bot, "conversations.join", { channel: channelId });

	if (!outcome.ok && !ALREADY_IN.includes(outcome.error ?? "")) {
		return {
			joined: false,
			reason: explain(outcome.error ?? "rejected"),
			needsHuman: needsHuman(outcome.error ?? "rejected"),
		};
	}

	await db.slackChannel.update({
		where: { id: channelId },
		data: { isMember: true, available: true, inviteRequestedAt: null },
	});

	return { joined: true, already: outcome.error === "already_in_channel" };
}

async function inviteWithUserToken(
	channelId: string,
	bot: string,
): Promise<{ ok: boolean; error?: string }> {
	const user = await slackUserToken();
	if (!user) return { ok: false, error: "no_user_grant" };

	const id = await botUserId(bot);
	if (!id) return { ok: false, error: "unknown_bot_user" };

	return call(user, "conversations.invite", { channel: channelId, users: id });
}

function needsHuman(error: string): boolean {
	return [
		"no_user_grant",
		"channel_not_found",
		"missing_scope",
		"not_in_channel",
		"invalid_auth",
		"token_revoked",
	].includes(error);
}

function explain(error: string): string {
	switch (error) {
		case "no_user_grant":
			return "This workspace did not grant Comp AI permission to add itself to a private channel.";
		case "channel_not_found":
			return "Slack cannot see this channel. A member has to invite Comp AI.";
		case "missing_scope":
			return "Slack refused: a permission is missing. Reconnect Slack.";
		case "invalid_auth":
		case "token_revoked":
			return "Slack needs to be reconnected.";
		case "unknown_bot_user":
			return "Slack did not report which user Comp AI is.";
		default:
			return `Slack refused the request (${error}).`;
	}
}
