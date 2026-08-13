import type { Db } from "../client";
import type { Prisma } from "../generated/prisma/client";
import { SETTINGS_ID } from "../settings";

const DAY_MS = 24 * 60 * 60_000;

export const MARKETING = {
	send: { perMinute: 300, dailyCap: 0, batchSize: 100 },
	quiet: { start: 8, end: 20, timeZone: "UTC" },
	cap: { windowMs: DAY_MS },
	overview: { windowMs: 30 * DAY_MS },
	drain: {
		tickMs: 30_000,
		leaseMs: 5 * 60_000,
		maxAttempts: 3,
		claimLimit: 200,
		retryBackoffMs: 60_000,
	},
	deliverability: {
		bounceWarn: 0.02,
		bouncePause: 0.05,
		complaintWarn: 0.001,
		complaintPause: 0.003,
		floor: 50,
	},
	attachments: { totalBytes: 40 * 1024 * 1024 },
	defer: { maxHours: 48 },
	split: { minPerArm: 100 },
	retention: { batch: 10_000, maxPasses: 50 },
	enrolment: { stuckAfterMs: 6 * 60 * 60_000 },
	image: { maxBytes: 2 * 1024 * 1024 },
} as const;

export const RESEND_OAUTH = {
	issuer: "https://api.resend.com",
	authorize: "https://api.resend.com/oauth/authorize",
	token: "https://api.resend.com/oauth/token",
	register: "https://api.resend.com/oauth/register",
	revoke: "https://api.resend.com/oauth/revoke",
	scope: "full_access",
	clientName: "Comp AI CRM",
	callbackPath: "/api/marketing/resend/callback",
	refreshSkewMs: 60_000,
	attemptTtlMs: 15 * 60_000,
	requestMs: 15_000,
	retryableStatus: [408, 429, 500, 502, 503, 504],
} as const;

export type MarketingSettings = {
	resendApiKey: string | null;
	resendClientId: string | null;
	resendClientSecret: string | null;
	resendAccessToken: string | null;
	resendRefreshToken: string | null;
	resendTokenExpires: Date | null;
	resendDomainId: string | null;
	sendingDomain: string | null;
	fromName: string | null;
	fromAddress: string | null;
	replyTo: string | null;
	postalAddress: string | null;
	sendsPerMinute: number;
	quietStart: number | null;
	quietEnd: number | null;
	timeZone: string;
	dailyCap: number | null;
	brandColor: string | null;
	logoUrl: string | null;
	onboardedAt: Date | null;
};

const SELECT = {
	marketingResendApiKey: true,
	marketingResendClientId: true,
	marketingResendClientSecret: true,
	marketingResendAccessToken: true,
	marketingResendRefreshToken: true,
	marketingResendTokenExpires: true,
	marketingResendDomainId: true,
	marketingSendingDomain: true,
	marketingFromName: true,
	marketingFromAddress: true,
	marketingReplyTo: true,
	marketingPostalAddress: true,
	marketingSendsPerMinute: true,
	marketingQuietStart: true,
	marketingQuietEnd: true,
	marketingTimeZone: true,
	marketingDailyCap: true,
	marketingBrandColor: true,
	marketingLogoUrl: true,
	marketingOnboardedAt: true,
} as const;

export async function readMarketingSettings(
	db: Db,
): Promise<MarketingSettings> {
	const row = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: SELECT,
	});

	return {
		resendApiKey: row?.marketingResendApiKey ?? null,
		resendClientId: row?.marketingResendClientId ?? null,
		resendClientSecret: row?.marketingResendClientSecret ?? null,
		resendAccessToken: row?.marketingResendAccessToken ?? null,
		resendRefreshToken: row?.marketingResendRefreshToken ?? null,
		resendTokenExpires: row?.marketingResendTokenExpires ?? null,
		resendDomainId: row?.marketingResendDomainId ?? null,
		sendingDomain: row?.marketingSendingDomain ?? null,
		fromName: row?.marketingFromName ?? null,
		fromAddress: row?.marketingFromAddress ?? null,
		replyTo: row?.marketingReplyTo ?? null,
		postalAddress: row?.marketingPostalAddress ?? null,
		sendsPerMinute: row?.marketingSendsPerMinute ?? MARKETING.send.perMinute,
		quietStart: row?.marketingQuietStart ?? null,
		quietEnd: row?.marketingQuietEnd ?? null,
		timeZone: row?.marketingTimeZone ?? MARKETING.quiet.timeZone,
		dailyCap: row?.marketingDailyCap ?? null,
		brandColor: row?.marketingBrandColor ?? null,
		logoUrl: row?.marketingLogoUrl ?? null,
		onboardedAt: row?.marketingOnboardedAt ?? null,
	};
}

export async function writeMarketingSettings(
	db: Db | Prisma.TransactionClient,
	patch: Partial<{
		resendApiKey: string | null;
		resendClientId: string | null;
		resendClientSecret: string | null;
		resendAccessToken: string | null;
		resendRefreshToken: string | null;
		resendTokenExpires: Date | null;
		resendDomainId: string | null;
		sendingDomain: string | null;
		fromName: string | null;
		fromAddress: string | null;
		replyTo: string | null;
		postalAddress: string | null;
		sendsPerMinute: number | null;
		quietStart: number | null;
		quietEnd: number | null;
		timeZone: string | null;
		dailyCap: number | null;
		brandColor: string | null;
		logoUrl: string | null;
		onboardedAt: Date | null;
	}>,
): Promise<void> {
	const data = {
		...(patch.resendApiKey !== undefined && {
			marketingResendApiKey: patch.resendApiKey,
		}),
		...(patch.resendClientId !== undefined && {
			marketingResendClientId: patch.resendClientId,
		}),
		...(patch.resendClientSecret !== undefined && {
			marketingResendClientSecret: patch.resendClientSecret,
		}),
		...(patch.resendAccessToken !== undefined && {
			marketingResendAccessToken: patch.resendAccessToken,
		}),
		...(patch.resendRefreshToken !== undefined && {
			marketingResendRefreshToken: patch.resendRefreshToken,
		}),
		...(patch.resendTokenExpires !== undefined && {
			marketingResendTokenExpires: patch.resendTokenExpires,
		}),
		...(patch.resendDomainId !== undefined && {
			marketingResendDomainId: patch.resendDomainId,
		}),
		...(patch.sendingDomain !== undefined && {
			marketingSendingDomain: patch.sendingDomain,
		}),
		...(patch.fromName !== undefined && { marketingFromName: patch.fromName }),
		...(patch.fromAddress !== undefined && {
			marketingFromAddress: patch.fromAddress,
		}),
		...(patch.replyTo !== undefined && { marketingReplyTo: patch.replyTo }),
		...(patch.postalAddress !== undefined && {
			marketingPostalAddress: patch.postalAddress,
		}),
		...(patch.sendsPerMinute !== undefined && {
			marketingSendsPerMinute: patch.sendsPerMinute,
		}),
		...(patch.quietStart !== undefined && {
			marketingQuietStart: patch.quietStart,
		}),
		...(patch.quietEnd !== undefined && { marketingQuietEnd: patch.quietEnd }),
		...(patch.timeZone !== undefined && { marketingTimeZone: patch.timeZone }),
		...(patch.dailyCap !== undefined && { marketingDailyCap: patch.dailyCap }),
		...(patch.brandColor !== undefined && {
			marketingBrandColor: patch.brandColor,
		}),
		...(patch.logoUrl !== undefined && { marketingLogoUrl: patch.logoUrl }),
		...(patch.onboardedAt !== undefined && {
			marketingOnboardedAt: patch.onboardedAt,
		}),
	};

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, ...data },
		update: data,
	});
}

export type SetupStep = "connect" | "identity" | "domain";

export type Sendable =
	| { ok: true }
	| { ok: false; missing: SetupStep[]; reason: string };

export type ResendConnection = "oauth" | "key" | null;

export function resendConnection(
	settings: MarketingSettings,
): ResendConnection {
	if (settings.resendRefreshToken || settings.resendAccessToken) return "oauth";
	return settings.resendApiKey ? "key" : null;
}

export async function assertSendable(db: Db): Promise<Sendable> {
	const settings = await readMarketingSettings(db);
	const missing: SetupStep[] = [];

	if (!resendConnection(settings)) missing.push("connect");
	if (!settings.fromAddress || !settings.postalAddress)
		missing.push("identity");
	if (!settings.sendingDomain) missing.push("domain");

	if (missing.length > 0) {
		return {
			ok: false,
			missing,
			reason: `Marketing is not set up yet: ${missing.join(", ")}.`,
		};
	}

	return { ok: true };
}

export function isOnboarded(settings: MarketingSettings): boolean {
	return settings.onboardedAt !== null;
}

export function maskKey(key: string | null): string | null {
	if (!key) return null;
	return key.length <= 8 ? "••••" : `${key.slice(0, 5)}••••${key.slice(-4)}`;
}
