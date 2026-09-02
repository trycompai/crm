export type SlackScopeGroup = "people" | "read" | "send" | "change";

export type SlackScope = {
	scope: string;
	group?: SlackScopeGroup;
	grant: string;
	sensitive: boolean;
};

export const SLACK_SCOPES: readonly SlackScope[] = [
	{
		scope: "users:read",
		group: "people",
		grant: "See the people in your workspace",
		sensitive: false,
	},
	{
		scope: "users:read.email",
		group: "people",
		grant: "See their email addresses, so it can match them to CRM records",
		sensitive: true,
	},
	{
		scope: "channels:read",
		group: "read",
		grant: "See the name and topic of every public channel",
		sensitive: false,
	},
	{
		scope: "groups:read",
		group: "read",
		grant: "See private channels it has been added to",
		sensitive: false,
	},
	{
		scope: "app_mentions:read",
		group: "read",
		grant: "See messages that mention it, so somebody can ask it for help",
		sensitive: false,
	},
	{
		scope: "channels:history",
		group: "read",
		grant: "Read messages in public channels it has been added to",
		sensitive: true,
	},
	{
		scope: "groups:history",
		group: "read",
		grant: "Read messages in private channels it has been added to",
		sensitive: false,
	},
	{
		scope: "chat:write",
		group: "send",
		grant: "Post messages as the app",
		sensitive: false,
	},
	{
		scope: "chat:write.public",
		group: "send",
		grant: "Post to any public channel, including ones it has not joined",
		sensitive: true,
	},
	{
		scope: "im:write",
		group: "send",
		grant: "Open a direct message with a person",
		sensitive: false,
	},
	{
		scope: "channels:join",
		group: "change",
		grant: "Join a public channel by itself",
		sensitive: true,
	},
	{
		scope: "channels:manage",
		group: "change",
		grant: "Create public channels, and rename or archive ones it is in",
		sensitive: true,
	},
	{
		scope: "groups:write",
		group: "change",
		grant: "Create private channels, and rename or archive ones it is in",
		sensitive: true,
	},
	{
		scope: "channels:write.invites",
		group: "change",
		grant: "Invite people to a public channel",
		sensitive: true,
	},
	{
		scope: "groups:write.invites",
		group: "change",
		grant: "Invite people to a private channel",
		sensitive: true,
	},
	{
		scope: "conversations.connect:write",
		group: "change",
		grant: "Send and accept Slack Connect invitations",
		sensitive: true,
	},
	{
		scope: "links:write",
		group: "send",
		grant: "Show a preview under a link it posts",
		sensitive: false,
	},
];

export const SLACK_REQUESTED_SCOPES = SLACK_SCOPES.map((entry) => entry.scope);

export const SLACK_USER_SCOPES = [
	"channels:read",
	"channels:write",
	"groups:read",
	"groups:write",
] as const;

export const SLACK_USER_GRANT = {
	scope: "slack:user-invite",
	grant: "Add itself to a private channel on your behalf",
	sensitive: true,
} as const satisfies SlackScope;

export const SLACK_SCOPE_GROUPS: ReadonlyArray<{
	id: SlackScopeGroup;
	label: string;
	summary: string;
}> = [
	{
		id: "people",
		label: "People",
		summary:
			"Names and email addresses, so it can match a Slack account to a CRM record.",
	},
	{
		id: "read",
		label: "Channels it can read",
		summary:
			"Names and topics of public channels, and the messages in any channel it has been added to.",
	},
	{
		id: "send",
		label: "Messages it can send",
		summary:
			"Post as the app, open a direct message, and preview a link it posts.",
	},
	{
		id: "change",
		label: "Channels it can change",
		summary: "Join, create, rename, archive, and invite people to channels.",
	},
];

export type SlackScopeSummary = {
	id: SlackScopeGroup;
	label: string;
	summary: string;
	total: number;
	broad: number;
};

export function summariseSlackScopes(
	granted: readonly string[],
): SlackScopeSummary[] {
	const held = describeSlackScopes(granted);

	return SLACK_SCOPE_GROUPS.map((group) => {
		const inGroup = held.filter((entry) => entry.group === group.id);
		return {
			...group,
			total: inGroup.length,
			broad: inGroup.filter((entry) => entry.sensitive).length,
		};
	}).filter((group) => group.total > 0);
}

export type SlackScopeDrift = {
	extra: SlackScope[];
	missing: SlackScope[];
};

export function slackScopeDrift(granted: readonly string[]): SlackScopeDrift {
	const held = new Set(granted);
	return {
		extra: describeSlackScopes(
			granted.filter((scope) => !SLACK_REQUESTED_SCOPES.includes(scope)),
		),
		missing: SLACK_SCOPES.filter((entry) => !held.has(entry.scope)),
	};
}

export function describeSlackScopes(granted: readonly string[]): SlackScope[] {
	const known = new Map(SLACK_SCOPES.map((entry) => [entry.scope, entry]));
	return granted.map(
		(scope) =>
			known.get(scope) ?? {
				scope,
				grant: `An undocumented permission named ${scope}`,
				sensitive: true,
			},
	);
}
