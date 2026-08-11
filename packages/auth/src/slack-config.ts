import { PRIORITY } from "@crm/db/agent-tasks";

const MINUTE_MS = 60_000;

export const SLACK_CONNECTION = {
	locks: {
		connection: "slack-connection",
		inventory: "slack-inventory",
	},

	install: {
		staleMs: 5 * MINUTE_MS,
	},

	inventory: {
		kind: "slack-people-match",
		reason: "Read Slack people and channels after the workspace connected",
		priority: PRIORITY.slackPeople,
		budget: 1,
	},
} as const;
