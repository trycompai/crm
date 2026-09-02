import { db } from "@crm/db";
import { schemas } from "@crm/validation";
import { z } from "zod";
import { SLACK_UNREACHABLE, slackGet, slackPost } from "./slack-api";
import { slackAccessToken, slackUserToken } from "./slack-connection";
import { requestSlackInventorySync } from "./slack-people";

export type JoinOutcome =
	| { joined: true; already: boolean }
	| { joined: false; reason: string; needsHuman: boolean };

type ChannelState = { isPrivate: boolean; isMember: boolean };

const ALREADY_IN_CHANNEL = "already_in_channel";

const CHANNEL_NOT_FOUND = "channel_not_found";

const NAME_TAKEN = "name_taken";

const channelInfo = schemas.slack.reply.extend({
	channel: z
		.object({
			is_private: z.boolean().optional(),
			is_member: z.boolean().optional(),
		})
		.nullish(),
});

async function call(
	token: string,
	method: string,
	body: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
	const outcome = await slackPost(token, method, body, schemas.slack.reply);
	return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
}

async function botUserId(token: string): Promise<string | null> {
	const outcome = await slackGet(
		token,
		"auth.test",
		{},
		schemas.slack.authTest,
	);

	return outcome.ok ? (outcome.data.user_id ?? null) : null;
}

async function liveChannelState(
	token: string,
	channelId: string,
): Promise<ChannelState | null> {
	try {
		const outcome = await slackGet(
			token,
			"conversations.info",
			{ channel: channelId },
			channelInfo,
		);

		if (outcome.ok && outcome.data.channel) {
			return {
				isPrivate: outcome.data.channel.is_private ?? false,
				isMember: outcome.data.channel.is_member ?? false,
			};
		}

		return !outcome.ok && outcome.error === CHANNEL_NOT_FOUND
			? { isPrivate: true, isMember: false }
			: null;
	} catch {
		return null;
	}
}

async function classifyChannel(
	channelId: string,
	cached: ChannelState,
	token: string,
): Promise<ChannelState> {
	const live = await liveChannelState(token, channelId);
	if (!live) return cached;
	if (
		live.isPrivate === cached.isPrivate &&
		live.isMember === cached.isMember
	) {
		return live;
	}

	await db.slackChannel
		.update({
			where: { id: channelId },
			data: { ...live, classifiedAt: new Date() },
		})
		.catch(() => null);
	await requestSlackInventorySync();

	return live;
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

	const bot = await slackAccessToken();
	if (!bot) {
		return {
			joined: false,
			reason: "Slack is not connected.",
			needsHuman: true,
		};
	}

	const state = await classifyChannel(
		channelId,
		{ isPrivate: channel.isPrivate, isMember: channel.isMember },
		bot,
	);
	if (state.isMember) return { joined: true, already: true };

	const outcome = state.isPrivate
		? await inviteWithUserToken(channelId, bot)
		: await call(bot, "conversations.join", { channel: channelId });

	if (!outcome.ok && outcome.error !== ALREADY_IN_CHANNEL) {
		return {
			joined: false,
			reason: explain(outcome.error ?? "rejected"),
			needsHuman: needsHuman(outcome.error ?? "rejected"),
		};
	}

	await db.slackChannel.update({
		where: { id: channelId },
		data: {
			isMember: true,
			available: true,
			inviteRequestedAt: null,
			classifiedAt: new Date(),
		},
	});

	return { joined: true, already: outcome.error === ALREADY_IN_CHANNEL };
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
		"is_archived",
	].includes(error);
}

function explain(error: string): string {
	switch (error) {
		case "no_user_grant":
			return "This workspace did not grant Comp AI permission to add itself to a private channel.";
		case "channel_not_found":
			return "Slack cannot see this channel. A member has to invite Comp AI.";
		case "is_archived":
			return "This channel is archived. Somebody has to unarchive it before Comp AI can join.";
		case "missing_scope":
			return "Slack refused: a permission is missing. Reconnect Slack.";
		case "invalid_auth":
		case "token_revoked":
			return "Slack needs to be reconnected.";
		case "unknown_bot_user":
			return "Slack did not report which user Comp AI is.";
		case SLACK_UNREACHABLE:
			return "Slack did not answer. This run can try again.";
		default:
			return `Slack refused the request (${error}).`;
	}
}

async function channelNamed(
	name: string,
): Promise<{ id: string; name: string } | { error: string }> {
	const channel = await db.slackChannel.findFirst({
		where: { name, available: true },
		select: { id: true, name: true },
	});

	if (!channel) {
		await requestSlackInventorySync();

		return {
			error: `#${name} already exists in Slack, and Comp AI cannot see it yet.`,
		};
	}

	const join = await joinSlackChannel(channel.id);
	if (!join.joined) return { error: join.reason };

	return channel;
}

export async function createSlackChannel(
	name: string,
	isPrivate: boolean,
): Promise<{ id: string; name: string } | { error: string }> {
	const user = await slackUserToken();
	const bot = await slackAccessToken();
	const token = isPrivate ? user : (user ?? bot);

	if (!token) {
		return {
			error: isPrivate
				? "This workspace did not grant Comp AI permission to create a private channel."
				: "Slack is not connected.",
		};
	}

	const outcome = await slackPost(
		token,
		"conversations.create",
		{ name, is_private: isPrivate },
		schemas.slack.createReply,
	);

	if (!outcome.ok) {
		if (outcome.error === NAME_TAKEN) return channelNamed(name);
		return { error: explain(outcome.error) };
	}

	if (!outcome.data.channel) {
		return { error: "Slack sent back something unreadable." };
	}

	const channel = outcome.data.channel;

	await db.slackChannel.upsert({
		where: { id: channel.id },
		create: {
			id: channel.id,
			name: channel.name,
			isPrivate,
			isMember: !isPrivate && token === bot,
			available: true,
			classifiedAt: new Date(),
		},
		update: {
			name: channel.name,
			isPrivate,
			available: true,
			classifiedAt: new Date(),
		},
	});

	if (token === user) await joinSlackChannel(channel.id);

	return channel;
}
