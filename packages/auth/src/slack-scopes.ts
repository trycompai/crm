export type SlackScope = {
	scope: string;
	grant: string;
	sensitive: boolean;
};

export const SLACK_SCOPES: readonly SlackScope[] = [
	{
		scope: "users:read",
		grant: "See the people in your workspace",
		sensitive: false,
	},
	{
		scope: "users:read.email",
		grant: "See their email addresses, so it can match them to CRM records",
		sensitive: true,
	},
	{
		scope: "channels:read",
		grant: "See the name and topic of every public channel",
		sensitive: false,
	},
	{
		scope: "groups:read",
		grant: "See private channels it has been added to",
		sensitive: false,
	},
	{
		scope: "channels:history",
		grant: "Read messages in public channels it has been added to",
		sensitive: true,
	},
	{
		scope: "groups:history",
		grant: "Read messages in private channels it has been added to",
		sensitive: true,
	},
	{
		scope: "chat:write",
		grant: "Post messages as the app",
		sensitive: false,
	},
	{
		scope: "chat:write.public",
		grant: "Post to any public channel, including ones it has not joined",
		sensitive: true,
	},
	{
		scope: "im:write",
		grant: "Open a direct message with a person",
		sensitive: false,
	},
	{
		scope: "channels:join",
		grant: "Join a public channel by itself",
		sensitive: true,
	},
	{
		scope: "channels:manage",
		grant: "Create public channels, and rename or archive ones it is in",
		sensitive: true,
	},
	{
		scope: "groups:write",
		grant: "Create private channels, and rename or archive ones it is in",
		sensitive: true,
	},
	{
		scope: "channels:write.invites",
		grant: "Invite people to a public channel",
		sensitive: true,
	},
	{
		scope: "groups:write.invites",
		grant: "Invite people to a private channel",
		sensitive: true,
	},
	{
		scope: "conversations.connect:write",
		grant: "Send and accept Slack Connect invitations",
		sensitive: true,
	},
	{
		scope: "links:write",
		grant: "Show a preview under a link it posts",
		sensitive: false,
	},
];

export const SLACK_REQUESTED_SCOPES = SLACK_SCOPES.map((entry) => entry.scope);

export function slackScopeDrift(granted: readonly string[]): {
	extra: SlackScope[];
	missing: SlackScope[];
} {
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
