import { schemas } from "@crm/validation";
import { slackGet, slackPost } from "./slack-api";
import { slackAccessToken } from "./slack-connection";

export type InviteOutcome =
	| {
			invited: true;
			email: string;
			kind: "member" | "connect";
			invite_id?: string;
			url?: string;
	  }
	| { invited: false; email: string; reason: string };

const ALREADY_IN_CHANNEL = "already_in_channel";
const USERS_NOT_FOUND = "users_not_found";

export async function inviteToSlackChannel(
	channelId: string,
	email: string,
): Promise<InviteOutcome> {
	const token = await slackAccessToken();
	if (!token) {
		return { invited: false, email, reason: "Slack is not connected." };
	}

	const found = await slackGet(
		token,
		"users.lookupByEmail",
		{ email },
		schemas.slack.lookupByEmail,
	);

	if (found.ok && found.data.user) {
		return inviteMember(token, channelId, email, found.data.user.id);
	}

	if (!found.ok && found.error !== USERS_NOT_FOUND) {
		return { invited: false, email, reason: explain(found.error) };
	}

	return inviteGuest(token, channelId, email);
}

async function inviteMember(
	token: string,
	channelId: string,
	email: string,
	userId: string,
): Promise<InviteOutcome> {
	const outcome = await slackPost(
		token,
		"conversations.invite",
		{ channel: channelId, users: userId },
		schemas.slack.reply,
	);

	if (outcome.ok || outcome.error === ALREADY_IN_CHANNEL) {
		return { invited: true, email, kind: "member" };
	}

	return { invited: false, email, reason: explain(outcome.error) };
}

async function inviteGuest(
	token: string,
	channelId: string,
	email: string,
): Promise<InviteOutcome> {
	const outcome = await slackPost(
		token,
		"conversations.inviteShared",
		{ channel: channelId, emails: [email], external_limited: false },
		schemas.slack.inviteShared,
	);

	if (outcome.ok) {
		return {
			invited: true,
			email,
			kind: "connect",
			invite_id: outcome.data.invite_id,
			url: outcome.data.url,
		};
	}

	if (outcome.error === ALREADY_IN_CHANNEL) {
		return { invited: true, email, kind: "connect" };
	}

	return { invited: false, email, reason: explain(outcome.error) };
}

function explain(error: string): string {
	switch (error) {
		case "not_in_channel":
			return "Comp AI is not in that channel, so it cannot invite anybody.";
		case "channel_not_found":
			return "Slack cannot see that channel.";
		case "invalid_email":
			return "Slack refused that address.";
		case "cannot_invite_self":
			return "That address is Comp AI itself.";
		case "missing_scope":
		case "restricted_action":
			return "This workspace doesn't let Comp AI send that invitation.";
		case "org_level_email_not_allowed":
			return "This workspace blocks Slack Connect invitations to that address.";
		case "invalid_auth":
		case "token_revoked":
			return "Slack needs to be reconnected.";
		default:
			return `Slack refused the invitation (${error}).`;
	}
}
