import { RESEND_OAUTH } from "@crm/db/marketing";

const SECOND_MS = 1_000;

export type MarketingLock = {
	key: string;
	waitMs: number;
	holdMs: number;
};

export const MARKETING_LOCKS = {
	resendRefresh: {
		key: "marketing:resend:refresh",
		waitMs: 20 * SECOND_MS,
		holdMs: 45 * SECOND_MS,
	},
	onboarding: {
		key: "marketing:onboarding",
		waitMs: 20 * SECOND_MS,
		holdMs: 60 * SECOND_MS,
	},
} as const;

export const RETRYABLE_STATUS: ReadonlySet<number> = new Set(
	RESEND_OAUTH.retryableStatus,
);
