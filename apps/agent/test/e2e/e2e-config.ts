const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const E2E = {
	dispatch: {
		agentPrefix: "E2E Dispatch Agent",
		companyPrefix: "E2E Co",
		domainPrefix: "e2e-",
		domainSuffix: ".test",
	},

	load: {
		agentPrefix: "E2E Load Agent",
		companyPrefix: "Load Co",
		domainPrefix: "load-",
		domainSuffix: ".test",
		defaultCount: 300,
		drainPassSlack: 5,
	},

	retry: {
		companyPrefix: "E2E Retry Co",
		kind: "e2e-retry",
		reason: "e2e.retry",
		priority: 900,
		claimLimit: 1,
		leaseMs: 5 * MINUTE_MS,
		expiredLeaseMs: MINUTE_MS,
		holdBackMs: 30 * SECOND_MS,
	},

	slackJoin: {
		bogusChannelId: "C00NOTREAL99",
		bogusChannelName: "missing",
	},

	channelCreate: {
		namePrefix: "e2e-create-",
	},

	liveRun: {
		agentPrefix: "E2E Live Agent",
		agentUrl: "http://localhost:3010",
		pollMs: 5 * SECOND_MS,
		giveUpMs: 5 * MINUTE_MS,
	},
} as const;
