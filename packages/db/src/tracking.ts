import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./client";
import { SETTINGS_ID } from "./settings";

export const SITE_ID_PREFIX = "cmp_";

export const COOKIE_NAME = "_crm_v";

export const COOKIE_LIFETIMES = [
	{ days: 395, label: "13 months" },
	{ days: 180, label: "6 months" },
	{ days: 0, label: "Session only" },
] as const;

export const MAX_EVENTS_PER_BATCH = 20;

export const MAX_BODY_BYTES = 32_768;

export const EVENTS_PER_MINUTE = 600;

export const CONTACTS_PER_HOUR = 50;

export const CONTACT_CAP_REASON = "Hourly contact cap reached — not filed";

export const LOADER_MAX_AGE_SECONDS = 600;

export const CONFIG_MAX_AGE_SECONDS = 300;

export const BUNDLE_MAX_AGE_SECONDS = 31_536_000;

export const EVENT_RETENTION_DAYS = 90;

export const SWEEP_BATCH = 10_000;

export const MAX_SWEEP_PASSES = 50;

export const VERIFY_WINDOW_MS = 5 * 60_000;

export const MAX_VERIFY_BYTES = 2_000_000;

export const MAX_CONTAINERS = 2;

export type GtmTagState = "absent" | "url" | "attribute";

export type DomainScopeValue = "SITE_AND_SUBDOMAINS" | "EXACT_HOST";

export interface TrackedHost {
	host: string;
	scope: DomainScopeValue;
}

export interface TrackingConfig {
	siteId: string;
	crossDomain: boolean;
	limitToDomains: boolean;
	cookieSubdomains: boolean;
	secureCookies: boolean;
	honourDnt: boolean;
	cookieDays: number;
	hosts: TrackedHost[];
}

export const LINKER_MAX_AGE_SECONDS = 120;

export function rateWindowKey(at: Date = new Date()): string {
	return `rate:${Math.floor(at.getTime() / 60_000)}`;
}

export function contactWindowKey(at: Date = new Date()): string {
	return `contacts:${Math.floor(at.getTime() / 3_600_000)}`;
}

export function windowExpiry(key: string, at: Date = new Date()): Date {
	const span = key.startsWith("rate:") ? 60_000 : 3_600_000;
	const bucket = Number(key.split(":")[1]);

	if (!Number.isFinite(bucket)) return new Date(at.getTime() + span * 2);

	return new Date((bucket + 1) * span + span);
}

export function trackingReady(
	limitToDomains: boolean,
	domainCount: number,
): boolean {
	return !limitToDomains || domainCount > 0;
}

export function mintSiteId(): string {
	return `${SITE_ID_PREFIX}${randomBytes(4).toString("hex")}`;
}

export function isSiteId(value: string | null | undefined): value is string {
	return typeof value === "string" && /^cmp_[0-9a-f]{8}$/.test(value);
}

export function loaderUrl(appUrl: string): string {
	return `${appUrl.replace(/\/+$/, "")}/t/crm.js`;
}

export function trackingSnippet(appUrl: string, siteId: string): string {
	return `<script src="${loaderUrl(appUrl)}" data-site="${siteId}" async defer></script>`;
}

export function gtmLoaderUrl(appUrl: string, siteId: string): string {
	return `${loaderUrl(appUrl)}?site=${siteId}`;
}

export function gtmSnippet(appUrl: string, siteId: string): string {
	return `<script src="${gtmLoaderUrl(appUrl, siteId)}" async defer></script>`;
}

export function gtmContainerUrl(container: string): string {
	return `https://www.googletagmanager.com/gtm.js?id=${container}`;
}

export function gtmContainers(html: string): string[] {
	const found = html.match(/GTM-[A-Z0-9]{4,10}/g) ?? [];

	return [...new Set(found)].slice(0, MAX_CONTAINERS);
}

export function gtmTag(source: string, siteId: string): GtmTagState {
	const text = source.replace(/\\\//g, "/");

	if (!text.includes("/t/crm.js")) return "absent";
	if (text.includes(`/t/crm.js?site=${siteId}`)) return "url";

	return text.includes(siteId) ? "attribute" : "absent";
}

export function configHash(config: TrackingConfig): string {
	const canonical = JSON.stringify({
		siteId: config.siteId,
		crossDomain: config.crossDomain,
		limitToDomains: config.limitToDomains,
		cookieSubdomains: config.cookieSubdomains,
		secureCookies: config.secureCookies,
		honourDnt: config.honourDnt,
		cookieDays: config.cookieDays,
		hosts: [...config.hosts]
			.map((entry) => `${entry.host}:${entry.scope}`)
			.sort(),
	});

	return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

export function isConfigHash(
	value: string | null | undefined,
): value is string {
	return typeof value === "string" && /^[0-9a-f]{12}$/.test(value);
}

export function normalizeHost(input: string | null | undefined): string | null {
	const trimmed = input?.trim().toLowerCase();
	if (!trimmed) return null;

	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	let host: string;
	try {
		host = new URL(withScheme).hostname;
	} catch {
		return null;
	}

	const bare = host.replace(/\.$/, "");
	if (!bare.includes(".")) return null;
	if (!/^[a-z0-9.-]+$/.test(bare)) return null;
	if (bare.startsWith(".") || bare.includes("..")) return null;

	return bare;
}

export function normalizePath(input: string | null | undefined): string {
	const raw = input?.trim();
	if (!raw) return "/";

	const path = raw.split(/[?#]/)[0] ?? "/";
	if (!path.startsWith("/")) return "/";

	const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;

	return trimmed === "" ? "/" : trimmed;
}

export function stripQuery(input: string | null | undefined): string | null {
	const raw = input?.trim();
	if (!raw) return null;

	const cut = raw.split(/[?#]/)[0] ?? "";

	return cut === "" ? null : cut;
}

export function matchedHost(
	host: string,
	config: TrackingConfig,
): TrackedHost | null {
	const candidate = host.toLowerCase();

	const exact = config.hosts.find((entry) => candidate === entry.host);
	if (exact) return exact;

	return (
		config.hosts.find(
			(entry) =>
				entry.scope === "SITE_AND_SUBDOMAINS" &&
				candidate.endsWith(`.${entry.host}`),
		) ?? null
	);
}

export function hostAllowed(host: string, config: TrackingConfig): boolean {
	if (!config.limitToDomains) return true;

	return matchedHost(host, config) !== null;
}

export function originAllowed(
	origin: string | null | undefined,
	config: TrackingConfig,
): boolean {
	if (!origin) return false;

	let host: string;
	try {
		host = new URL(origin).hostname.toLowerCase();
	} catch {
		return false;
	}

	if (!config.limitToDomains) return true;

	return hostAllowed(host, config);
}

export function dedupeKey(parts: {
	host: string;
	path: string;
	email: string | null;
	at: Date;
}): string {
	const minute = Math.floor(parts.at.getTime() / 60_000);

	return createHash("sha256")
		.update(`${parts.host}|${parts.path}|${parts.email ?? ""}|${minute}`)
		.digest("hex");
}

export async function readTrackingConfig(
	db: Db,
): Promise<TrackingConfig | null> {
	const [settings, domains] = await Promise.all([
		db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: {
				trackingSiteId: true,
				trackingCrossDomain: true,
				trackingLimitToDomains: true,
				trackingCookieSubdomains: true,
				trackingSecureCookies: true,
				trackingHonourDnt: true,
				trackingCookieDays: true,
				trackingPaused: true,
			},
		}),
		db.trackedDomain.findMany({
			select: { host: true, scope: true },
			orderBy: { host: "asc" },
		}),
	]);

	if (!isSiteId(settings?.trackingSiteId)) return null;
	if (settings.trackingPaused) return null;

	return {
		siteId: settings.trackingSiteId,
		crossDomain: settings.trackingCrossDomain,
		limitToDomains: settings.trackingLimitToDomains,
		cookieSubdomains: settings.trackingCookieSubdomains,
		secureCookies: settings.trackingSecureCookies,
		honourDnt: settings.trackingHonourDnt,
		cookieDays: settings.trackingCookieDays,
		hosts: domains.map((entry) => ({
			host: entry.host,
			scope: entry.scope as DomainScopeValue,
		})),
	};
}
