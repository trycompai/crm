const MINUTE_MS = 60_000;

export const DISPATCH = {
	visible: {
		batch: 60,
		concurrency: 6,
		leaseMs: 2 * MINUTE_MS,
	},

	research: {
		batch: 12,
		leaseMs: 30 * MINUTE_MS,
	},

	builder: {
		batch: 20,
		maxAttempts: 3,
		leaseMs: 5 * MINUTE_MS,
	},

	run: {
		batch: 20,
		deliveryLeaseMs: 5 * MINUTE_MS,
		actionLeaseMs: 5 * MINUTE_MS,
		executionTimeoutMs: 20 * MINUTE_MS,
	},

	task: {
		leaseMs: 10 * MINUTE_MS,
	},

	sweep: {
		timeoutMs: 4 * MINUTE_MS,
		staleQueueMs: 5 * MINUTE_MS,
		startTimeoutMs: MINUTE_MS,
	},
} as const;
