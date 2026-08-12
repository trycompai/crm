import { db } from "@crm/db";
import { queueSlackInventorySync } from "@crm/db/slack-inventory";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { parse, schemas } from "@crm/validation";
import { z } from "zod";
import { SLACK } from "./slack-config";
import { slackAccessToken, slackUserToken } from "./slack-connection";

const slackMember = z.object({
	id: z.string().trim().min(1),
	name: z.string().trim().min(1).optional(),
	profile: z.object({ email: z.string().trim().min(1).nullish() }).nullish(),
	deleted: z.boolean().optional(),
	is_bot: z.boolean().optional(),
});

const slackChannel = z.object({
	id: z.string().trim().min(1),
	name: z.string().trim().min(1),
	num_members: z.number().int().nonnegative().nullish(),
	is_member: z.boolean().optional(),
	is_archived: z.boolean().optional(),
	is_private: z.boolean().optional(),
});

const pageMetadata = z.object({ next_cursor: z.string().nullish() }).nullish();

const memberPage = schemas.slack.reply.extend({
	members: z.array(slackMember).default([]),
	response_metadata: pageMetadata,
});

const channelPage = schemas.slack.reply.extend({
	channels: z.array(slackChannel).default([]),
	response_metadata: pageMetadata,
});

type SlackMember = z.infer<typeof slackMember>;
type SlackChannel = z.infer<typeof slackChannel>;
type SlackPage = {
	ok: boolean;
	error?: string;
	response_metadata?: { next_cursor?: string | null } | null;
};

const RECONNECT_ERRORS = ["invalid_auth", "account_inactive", "token_revoked"];

const INVENTORY_REASON =
	"Read Slack people and channels again: the cached inventory is stale";

export async function requestSlackInventorySync(): Promise<void> {
	await queueSlackInventorySync(INVENTORY_REASON);
}

export async function requestStaleSlackInventorySync(): Promise<void> {
	try {
		const newest = await db.slackChannel.findFirst({
			orderBy: { updatedAt: "desc" },
			select: { updatedAt: true },
		});
		const fresh =
			newest !== null &&
			Date.now() - newest.updatedAt.getTime() < SLACK.inventory.staleMs;
		if (fresh) return;
	} catch {
		return;
	}

	await requestSlackInventorySync();
}

export async function runSlackPeopleMatch(): Promise<string> {
	const accessToken = await slackAccessToken();
	if (!accessToken) return "Slack is not connected.";

	const userToken = await slackUserToken();
	const [slackMembers, slackChannels] = await Promise.all([
		listSlackMembers(accessToken),
		visibleChannels(accessToken, userToken),
	]);
	const availableMembers = slackMembers.filter(
		(member) => !member.deleted && !member.is_bot,
	);
	const byEmail = new Map(
		availableMembers.flatMap((member) => {
			const email = member.profile?.email?.trim().toLowerCase();
			return email ? [[email, member] as const] : [];
		}),
	);
	const crmMembers = await db.member.findMany({
		where: { organizationId: WORKSPACE_ID },
		select: {
			user: {
				select: {
					id: true,
					email: true,
				},
			},
		},
	});

	let matched = 0;
	for (const { user } of crmMembers) {
		const slack = byEmail.get(user.email.trim().toLowerCase());
		const slackHandle = slack ? `@${slack.name ?? slack.id}` : null;
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
			},
		});
		if (slack) matched += 1;
	}

	const availableChannels = await persistSlackChannels(
		slackChannels,
		Boolean(userToken),
	);
	return `Matched ${matched} workspace ${matched === 1 ? "member" : "members"} by email and found ${availableChannels} available ${availableChannels === 1 ? "channel" : "channels"}.`;
}

export async function refreshSlackChannels(): Promise<number> {
	const accessToken = await slackAccessToken();
	if (!accessToken) return 0;

	const userToken = await slackUserToken();
	return persistSlackChannels(
		await visibleChannels(accessToken, userToken),
		Boolean(userToken),
	);
}

async function visibleChannels(
	botToken: string,
	userToken: string | null,
): Promise<SlackChannel[]> {
	const fromBot = await listSlackChannels(botToken);
	if (!userToken) return fromBot;

	const seen = new Map(fromBot.map((channel) => [channel.id, channel]));

	const fromUser = await listSlackChannels(userToken).catch(() => []);

	for (const channel of fromUser) {
		if (seen.has(channel.id)) continue;
		seen.set(channel.id, { ...channel, is_member: false });
	}

	return [...seen.values()];
}

export async function persistSlackChannels(
	channels: SlackChannel[],
	canInviteItself: boolean,
): Promise<number> {
	const available = [
		...new Map(
			channels
				.filter(
					(channel) =>
						!channel.is_archived &&
						(channel.is_member || !channel.is_private || canInviteItself),
				)
				.map((channel) => [channel.id, channel] as const),
		).values(),
	];

	return db.$transaction(async (tx) => {
		const [account] = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id
			FROM "account"
			WHERE "providerId" = 'slack' AND "accessToken" IS NOT NULL
			ORDER BY "updatedAt" DESC
			LIMIT 1
			FOR UPDATE
		`;
		if (!account) return 0;

		const ids = available.map((channel) => channel.id);
		await tx.slackChannel.updateMany({
			where: { id: { notIn: ids } },
			data: { available: false },
		});
		if (ids.length === 0) return 0;

		await tx.$executeRaw`
			INSERT INTO "slackChannel" (id, name, "memberCount", "isPrivate", "isMember", available, "classifiedAt", "createdAt", "updatedAt")
			SELECT id, name, "memberCount", "isPrivate", "isMember", true, NOW(), NOW(), NOW()
			FROM UNNEST(
				${ids}::text[],
				${available.map((channel) => channel.name)}::text[],
				${available.map((channel) => channel.num_members ?? null)}::int[],
				${available.map((channel) => channel.is_private ?? false)}::boolean[],
				${available.map((channel) => channel.is_member ?? false)}::boolean[]
			) AS incoming(id, name, "memberCount", "isPrivate", "isMember")
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				"memberCount" = EXCLUDED."memberCount",
				"isPrivate" = EXCLUDED."isPrivate",
				"isMember" = EXCLUDED."isMember",
				available = true,
				"classifiedAt" = NOW(),
				"updatedAt" = NOW()
		`;

		return ids.length;
	});
}

async function listSlackMembers(accessToken: string): Promise<SlackMember[]> {
	const members: SlackMember[] = [];
	let cursor = "";
	do {
		const page = await readSlackPage(
			accessToken,
			listUrl("users.list", cursor),
			memberPage,
			"member lookup",
		);
		members.push(...page.members);
		cursor = page.response_metadata?.next_cursor ?? "";
	} while (cursor);
	return members;
}

async function listSlackChannels(accessToken: string): Promise<SlackChannel[]> {
	const channels: SlackChannel[] = [];
	let cursor = "";
	do {
		const page = await readSlackPage(
			accessToken,
			listUrl("conversations.list", cursor, {
				exclude_archived: "true",
				types: SLACK.inventory.channelTypes,
			}),
			channelPage,
			"channel lookup",
		);
		channels.push(...page.channels);
		cursor = page.response_metadata?.next_cursor ?? "";
	} while (cursor);
	return channels;
}

function listUrl(
	method: string,
	cursor: string,
	params: Record<string, string> = {},
): URL {
	const url = new URL(`https://slack.com/api/${method}`);
	url.searchParams.set("limit", String(SLACK.inventory.pageSize));
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	if (cursor) url.searchParams.set("cursor", cursor);
	return url;
}

async function readSlackPage<Schema extends z.ZodType<SlackPage>>(
	token: string,
	url: URL,
	schema: Schema,
	operation: string,
): Promise<z.infer<Schema>> {
	const response = await fetch(url, {
		headers: { authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(SLACK.request.timeoutMs),
	});
	if (!response.ok) throw new Error(`Slack ${operation} failed.`);

	const page = parse(schema, await response.json(), `Slack ${operation}`);
	if (!page.ok) throw rejected(page.error ?? "rejected", operation);
	return page;
}

function rejected(reason: string, operation: string): Error {
	if (reason === "missing_scope") {
		return new Error(
			`Slack ${operation} needs an additional permission. Reconnect Slack and retry.`,
		);
	}
	if (RECONNECT_ERRORS.includes(reason)) {
		return new Error(
			`Slack ${operation} needs the workspace to be reconnected.`,
		);
	}
	return new Error(`Slack ${operation} was rejected (${reason}).`);
}
