const MINUTE_MS = 60_000;

export const DEV_SESSION = {
	cookie: { days: 7, maxAgeSeconds: 7 * 24 * 60 * 60 },
	login: { timeoutMs: 10 * MINUTE_MS },
} as const;
