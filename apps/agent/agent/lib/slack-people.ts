import { db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { slackAccessToken } from "./slack-connection";

type SlackMember = {
	id: string;
	name: string;
	profile?: { email?: string };
	deleted?: boolean;
	is_bot?: boolean;
};

type SlackChannel = {
	id: string;
	name: string;
	num_members?: number;
	is_member?: boolean;
	is_archived?: boolean;
};

export async function runSlackPeopleMatch(): Promise<string> {
	const accessToken = await slackAccessToken();
	if (!accessToken) return "Slack is not connected.";

	const [slackMembers, slackChannels] = await Promise.all([
		listSlackMembers(accessToken),
		listSlackChannels(accessToken),
	]);
	const availableMembers = slackMembers.filter(
		(member) => !member.deleted && !member.is_bot,
	);
	const byEmail = new Map(
		availableMembers.flatMap((member) => {
			const email = member.profile?.email?.trim().toLowerCase();
			return email ? [[email, member]] : [];
		}),
	);
	const byId = new Map(availableMembers.map((member) => [member.id, member]));
	const crmMembers = await db.member.findMany({
		where: { organizationId: WORKSPACE_ID },
		select: {
			user: {
				select: {
					id: true,
					email: true,
					slackMemberMatch: {
						select: {
							slackUserId: true,
						},
					},
				},
			},
		},
	});

	let matched = 0;
	for (const { user } of crmMembers) {
		const preserved = user.slackMemberMatch?.slackUserId
			? byId.get(user.slackMemberMatch.slackUserId)
			: null;
		const slack = preserved ?? byEmail.get(user.email.trim().toLowerCase());
		const slackHandle = slack ? `@${slack.name || slack.id}` : null;
		await db.slackMemberMatch.upsert({
			where: { crmUserId: user.id },
			create: {
				crmUserId: user.id,
				slackUserId: slack?.id,
				slackHandle,
				slackEmail: slack?.profile?.email,
			},
			update: {
				slackUserId: slack?.id ?? null,
				slackHandle,
				slackEmail: slack?.profile?.email ?? null,
				explicitlyUnmatched: false,
			},
		});
		if (slack) matched += 1;
	}

	const availableChannels = await persistSlackChannels(slackChannels);
	return `Matched ${matched} workspace ${matched === 1 ? "member" : "members"} by email and found ${availableChannels} available ${availableChannels === 1 ? "channel" : "channels"}.`;
}

export async function refreshSlackChannels(): Promise<number> {
	const accessToken = await slackAccessToken();
	if (!accessToken) return 0;

	return persistSlackChannels(await listSlackChannels(accessToken));
}

async function persistSlackChannels(channels: SlackChannel[]): Promise<number> {
	const available = channels.filter(
		(channel) => channel.is_member && !channel.is_archived,
	);
	await db.$transaction(async (tx) => {
		await tx.slackChannel.updateMany({ data: { available: false } });
		for (const channel of available) {
			await tx.slackChannel.upsert({
				where: { id: channel.id },
				create: {
					id: channel.id,
					name: channel.name,
					memberCount: channel.num_members,
				},
				update: {
					name: channel.name,
					memberCount: channel.num_members,
					available: true,
				},
			});
		}
	});

	return available.length;
}

async function listSlackMembers(accessToken: string): Promise<SlackMember[]> {
	const members: SlackMember[] = [];
	let cursor = "";
	do {
		const url = new URL("https://slack.com/api/users.list");
		url.searchParams.set("limit", "200");
		if (cursor) url.searchParams.set("cursor", cursor);
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!response.ok) throw new Error("Slack member lookup failed.");
		const data = await response.json();
		assertSlackResponse(data, "member lookup");
		const page = Reflect.get(data, "members");
		if (Array.isArray(page)) members.push(...(page as SlackMember[]));
		const metadata = Reflect.get(data, "response_metadata");
		cursor =
			metadata && typeof metadata === "object"
				? String(Reflect.get(metadata, "next_cursor") ?? "")
				: "";
	} while (cursor);
	return members;
}

async function listSlackChannels(accessToken: string): Promise<SlackChannel[]> {
	const channels: SlackChannel[] = [];
	let cursor = "";
	do {
		const url = new URL("https://slack.com/api/conversations.list");
		url.searchParams.set("limit", "200");
		url.searchParams.set("exclude_archived", "true");
		url.searchParams.set("types", "public_channel,private_channel");
		if (cursor) url.searchParams.set("cursor", cursor);
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!response.ok) throw new Error("Slack channel lookup failed.");
		const data = await response.json();
		assertSlackResponse(data, "channel lookup");
		const page = Reflect.get(data, "channels");
		if (Array.isArray(page)) channels.push(...(page as SlackChannel[]));
		const metadata = Reflect.get(data, "response_metadata");
		cursor =
			metadata && typeof metadata === "object"
				? String(Reflect.get(metadata, "next_cursor") ?? "")
				: "";
	} while (cursor);
	return channels;
}

function assertSlackResponse(value: unknown, operation: string): void {
	if (value && typeof value === "object" && Reflect.get(value, "ok") === true) {
		return;
	}
	const reason =
		value && typeof value === "object"
			? String(Reflect.get(value, "error") ?? "rejected")
			: "rejected";
	if (reason === "missing_scope") {
		throw new Error(
			`Slack ${operation} needs an additional permission. Reconnect Slack and retry.`,
		);
	}
	if (["invalid_auth", "account_inactive", "token_revoked"].includes(reason)) {
		throw new Error(
			`Slack ${operation} needs the workspace to be reconnected.`,
		);
	}
	throw new Error(`Slack ${operation} was rejected (${reason}).`);
}
