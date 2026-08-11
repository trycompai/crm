const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const E2E = {
	dispatch: {
		agentPrefix: "E2E Dispatch Agent",
	},

	load: {
		agentPrefix: "E2E Load Agent",
		defaultCount: 300,
		maxDrainPasses: 40,
	},

	liveRun: {
		agentPrefix: "E2E Live Agent",
		agentUrl: "http://localhost:3010",
		pollMs: 5 * SECOND_MS,
		giveUpMs: 5 * MINUTE_MS,
	},
} as const;
