import { z } from "zod";
import { SLACK, SLACK_SYNC_STATES } from "./slack-config";

export const slackChannelsInput = z.object({
	cursor: z.string().trim().min(1).max(64).nullish(),
	limit: z.number().int().min(1).max(SLACK.channels.maxPageSize).optional(),
	query: z.string().trim().max(120).optional(),
});

export type SlackChannelsInput = z.infer<typeof slackChannelsInput>;

export const slackJoinChannelInput = z.object({
	channelId: z.string().trim().min(1).max(64),
});

export type SlackJoinChannelInput = z.infer<typeof slackJoinChannelInput>;

export const slackCreateChannelInput = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.regex(/^[a-z0-9-_]+$/, "Use lowercase letters, numbers and dashes."),
	isPrivate: z.boolean().default(false),
});

export type SlackCreateChannelInput = z.infer<typeof slackCreateChannelInput>;

export const slackCreateChannelReply = z.union([
	z.object({
		channel: z.object({
			id: z.string().trim().min(1).max(64),
			name: z.string().trim().min(1).max(120),
		}),
	}),
	z.object({ error: z.string().trim().min(1).max(500) }),
]);

export type SlackCreateChannelReply = z.infer<typeof slackCreateChannelReply>;

const slackSyncStateOutput = z.enum(SLACK_SYNC_STATES);

const slackAgentSummaryOutput = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	status: z.enum([
		"DRAFT",
		"DEPLOYING",
		"LIVE",
		"PAUSED",
		"ARCHIVED",
		"DELETED",
	]),
});

export const slackStatusOutput = z.object({
	configured: z.boolean(),
	connected: z.boolean(),
	workspace: z.string().nullable(),
	lastConnectedAt: z.string().nullable(),
	scopes: z.array(z.string()),
	canInviteItself: z.boolean(),
	canManage: z.boolean(),
	agents: z.array(slackAgentSummaryOutput),
	people: z.object({
		matched: z.number(),
		reviewed: z.number(),
	}),
});

export type SlackStatus = z.infer<typeof slackStatusOutput>;

const slackMemberMatchOutput = z.object({
	slackUserId: z.string().nullable(),
	slackHandle: z.string().nullable(),
	slackEmail: z.string().nullable(),
});

export const slackMatchesOutput = z.object({
	rows: z.array(
		z.object({
			crmUserId: z.string(),
			name: z.string(),
			email: z.string(),
			match: slackMemberMatchOutput.nullable(),
		}),
	),
	sync: slackSyncStateOutput,
});

export type SlackMatches = z.infer<typeof slackMatchesOutput>;

export const slackChannelsOutput = z.object({
	canInviteItself: z.boolean(),
	sync: slackSyncStateOutput,
	nextCursor: z.string().nullable(),
	rows: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			memberCount: z.number().nullable(),
			isPrivate: z.boolean(),
			isMember: z.boolean(),
			classified: z.boolean(),
			inviteRequestedAt: z.string().nullable(),
		}),
	),
});

export type SlackChannelsResult = z.infer<typeof slackChannelsOutput>;

export const slackJoinChannelOutput = z.object({
	queued: z.boolean(),
	alreadyJoined: z.boolean(),
});

export type SlackJoinChannelResult = z.infer<typeof slackJoinChannelOutput>;

export const slackRefreshPeopleOutput = z.object({
	requested: z.boolean(),
});

export type SlackRefreshPeopleResult = z.infer<typeof slackRefreshPeopleOutput>;

export const slackCreateChannelOutput = z.object({
	channel: z.object({
		id: z.string(),
		name: z.string(),
	}),
});

export type SlackCreateChannelResult = z.infer<typeof slackCreateChannelOutput>;

export const slackDisconnectOutput = z.object({
	disconnected: z.boolean(),
});

export type SlackDisconnectResult = z.infer<typeof slackDisconnectOutput>;
