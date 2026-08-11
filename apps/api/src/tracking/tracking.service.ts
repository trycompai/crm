import {
	appUrl,
	canManageTracking,
	isWorkspaceRole,
	WORKSPACE_ID,
	type WorkspaceRole,
} from "@crm/auth";
import { type Db, DomainScope, Prisma } from "@crm/db";
import { describeTouch } from "@crm/db/attribution";
import { safeFetch } from "@crm/db/safe-fetch";
import { SETTINGS_ID } from "@crm/db/settings";
import {
	COOKIE_LIFETIMES,
	gtmContainers,
	gtmContainerUrl,
	gtmSnippet,
	gtmTag,
	hostAllowed,
	loaderUrl,
	MAX_VERIFY_BYTES,
	normalizeHost,
	trackingReady,
	trackingSnippet,
	VERIFY_WINDOW_MS,
} from "@crm/db/tracking";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { TrackingConfigService } from "./tracking-config.service";

export interface TrackedDomainRow {
	id: string;
	host: string;
	scope: DomainScope;
	pageViews: number;
	lastSeenAt: string | null;
}

export interface TrackingSettings {
	siteId: string | null;
	ready: boolean;
	scriptUrl: string;
	snippet: string | null;
	tagManagerSnippet: string | null;
	crossDomain: boolean;
	limitToDomains: boolean;
	cookieSubdomains: boolean;
	secureCookies: boolean;
	honourDnt: boolean;
	cookieDays: number;
	paused: boolean;
	cookieLifetimes: { days: number; label: string }[];
	domains: TrackedDomainRow[];
	receivingSince: string | null;
	pageViews: number;
	submissions: number;
	canManage: boolean;
}

export interface VisitedPage {
	host: string;
	path: string;
	views: number;
	lastSeenAt: string;
}

export interface TouchSummary {
	label: string;
	source: string;
	medium: string | null;
	campaign: string | null;
	landing: string | null;
	referrer: string | null;
	at: string | null;
}

export interface WebsiteActivity {
	identified: boolean;
	visitors: number;
	views: number;
	lastSeenAt: string | null;
	pages: VisitedPage[];
	firstTouch: TouchSummary | null;
	lastTouch: TouchSummary | null;
}

export interface SourceRow {
	source: string;
	medium: string | null;
	views: number;
	contacts: number;
}

export interface FoundInContainer {
	id: string;
	carriesSiteId: boolean;
}

export type VerifyResult =
	| {
			status: "found";
			host: string;
			responseMs: number;
			allowed: boolean;
			pageView: boolean;
			container: FoundInContainer | null;
	  }
	| {
			status: "missing";
			host: string;
			responseMs: number;
			containers: string[];
	  }
	| { status: "unreachable"; host: string; detail: string };

@Injectable()
export class TrackingService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly config: TrackingConfigService,
	) {}

	async settings(userId: string): Promise<TrackingSettings> {
		const [row, domains, latest, pageViews, submissions] = await Promise.all([
			this.db.appSetting.findUnique({
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
			this.db.trackedDomain.findMany({ orderBy: { createdAt: "asc" } }),
			this.db.trackedEvent.findFirst({
				orderBy: { occurredAt: "desc" },
				select: { occurredAt: true },
			}),
			this.db.trackedEvent.count({ where: { type: "page_view" } }),
			this.db.formSubmission.count(),
		]);

		const ready = trackingReady(
			row?.trackingLimitToDomains ?? true,
			domains.length,
		);

		const siteId = ready
			? await this.config.ensureSiteId()
			: (row?.trackingSiteId ?? null);

		return {
			siteId,
			ready,
			scriptUrl: scriptUrl(),
			snippet: siteId ? snippet(siteId) : null,
			tagManagerSnippet: siteId ? gtmSnippet(appUrl, siteId) : null,
			crossDomain: row?.trackingCrossDomain ?? true,
			limitToDomains: row?.trackingLimitToDomains ?? true,
			cookieSubdomains: row?.trackingCookieSubdomains ?? false,
			secureCookies: row?.trackingSecureCookies ?? true,
			honourDnt: row?.trackingHonourDnt ?? true,
			cookieDays: row?.trackingCookieDays ?? 395,
			paused: row?.trackingPaused ?? false,
			cookieLifetimes: [...COOKIE_LIFETIMES],
			domains: domains.map((domain) => ({
				id: domain.id,
				host: domain.host,
				scope: domain.scope,
				pageViews: domain.pageViews,
				lastSeenAt: domain.lastSeenAt?.toISOString() ?? null,
			})),
			receivingSince: latest?.occurredAt.toISOString() ?? null,
			pageViews,
			submissions,
			canManage: canManageTracking(await this.roleOf(userId)),
		};
	}

	async setFlag(
		userId: string,
		flag:
			| "crossDomain"
			| "limitToDomains"
			| "cookieSubdomains"
			| "secureCookies"
			| "honourDnt"
			| "paused",
		enabled: boolean,
	): Promise<void> {
		await this.assertCanManage(userId);

		const column = {
			crossDomain: "trackingCrossDomain",
			limitToDomains: "trackingLimitToDomains",
			cookieSubdomains: "trackingCookieSubdomains",
			secureCookies: "trackingSecureCookies",
			honourDnt: "trackingHonourDnt",
			paused: "trackingPaused",
		}[flag];

		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, [column]: enabled },
			update: { [column]: enabled },
		});

		await this.config.invalidate();
	}

	async setCookieDays(userId: string, days: number): Promise<void> {
		await this.assertCanManage(userId);

		if (!COOKIE_LIFETIMES.some((entry) => entry.days === days)) {
			throw new BadRequestException("That is not a cookie lifetime we offer.");
		}

		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, trackingCookieDays: days },
			update: { trackingCookieDays: days },
		});

		await this.config.invalidate();
	}

	async addDomain(
		userId: string,
		input: { host: string; scope: DomainScope },
	): Promise<TrackedDomainRow> {
		await this.assertCanManage(userId);

		const host = normalizeHost(input.host);
		if (!host) {
			throw new BadRequestException(
				"That is not a domain. Try something like acme.com.",
			);
		}

		try {
			const domain = await this.db.trackedDomain.create({
				data: { host, scope: input.scope },
			});

			await this.config.invalidate();

			return {
				id: domain.id,
				host: domain.host,
				scope: domain.scope,
				pageViews: domain.pageViews,
				lastSeenAt: null,
			};
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				throw new BadRequestException(`${host} is already on the list.`);
			}

			throw error;
		}
	}

	async removeDomain(userId: string, id: string): Promise<void> {
		await this.assertCanManage(userId);

		try {
			await this.db.trackedDomain.delete({ where: { id } });
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2025"
			) {
				throw new NotFoundException("That domain is already gone.");
			}

			throw error;
		}

		await this.config.invalidate();
	}

	async rotateSiteId(userId: string): Promise<{ siteId: string }> {
		await this.assertCanManage(userId);

		return { siteId: await this.config.rotateSiteId() };
	}

	async verify(userId: string, url: string): Promise<VerifyResult> {
		await this.assertCanManage(userId);

		const domains = await this.db.trackedDomain.count();
		const row = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { trackingLimitToDomains: true },
		});

		if (!trackingReady(row?.trackingLimitToDomains ?? true, domains)) {
			throw new BadRequestException(
				"Add the domain your website runs on first — there is no script to find yet.",
			);
		}

		const target = absolute(url);
		if (!target) {
			throw new BadRequestException(
				"That is not a URL. Try something like acme.com/pricing.",
			);
		}

		const compiled = await this.config.compiled();
		const started = Date.now();
		const fetched = await safeFetch(target.toString(), { timeoutMs: 8_000 });
		const responseMs = Date.now() - started;
		const host = (fetched?.url ?? target).hostname.toLowerCase();

		if (!fetched?.response.ok) {
			return {
				status: "unreachable",
				host,
				detail: fetched
					? `The page answered ${fetched.response.status}.`
					: "We could not reach that page.",
			};
		}

		const body = (await fetched.response.text()).slice(0, MAX_VERIFY_BYTES);
		const siteId = compiled?.config.siteId;

		if (!siteId) {
			return { status: "missing", host, responseMs, containers: [] };
		}

		const inHtml = mentions(body, siteId);
		const containers = inHtml ? [] : gtmContainers(body);
		const container = inHtml
			? null
			: await this.inContainers(containers, siteId);

		if (!inHtml && !container) {
			return { status: "missing", host, responseMs, containers };
		}

		const since = new Date(Date.now() - VERIFY_WINDOW_MS);
		const seen = await this.db.trackedEvent.findFirst({
			where: { host, occurredAt: { gte: since } },
			select: { id: true },
		});

		return {
			status: "found",
			host,
			responseMs,
			allowed: compiled ? hostAllowed(host, compiled.config) : false,
			pageView: seen !== null,
			container,
		};
	}

	private async inContainers(
		containers: string[],
		siteId: string,
	): Promise<FoundInContainer | null> {
		let attribute: FoundInContainer | null = null;

		for (const id of containers) {
			const fetched = await safeFetch(gtmContainerUrl(id), {
				timeoutMs: 8_000,
			});
			if (!fetched?.response.ok) continue;

			const source = (await fetched.response.text()).slice(0, MAX_VERIFY_BYTES);
			const state = gtmTag(source, siteId);

			if (state === "url") return { id, carriesSiteId: true };
			if (state === "attribute" && !attribute) {
				attribute = { id, carriesSiteId: false };
			}
		}

		return attribute;
	}

	async activityForCompany(companyId: string): Promise<WebsiteActivity> {
		const visitors = await this.db.trackedVisitor.findMany({
			where: { contact: { companyId } },
			select: { id: true },
		});

		return this.activityFor(visitors.map((visitor) => visitor.id));
	}

	async activityForContact(contactId: string): Promise<WebsiteActivity> {
		const visitors = await this.db.trackedVisitor.findMany({
			where: { contactId },
			select: { id: true },
		});

		return this.activityFor(visitors.map((visitor) => visitor.id));
	}

	private async activityFor(visitorIds: string[]): Promise<WebsiteActivity> {
		if (visitorIds.length === 0) {
			return {
				identified: false,
				visitors: 0,
				views: 0,
				lastSeenAt: null,
				pages: [],
				firstTouch: null,
				lastTouch: null,
			};
		}

		const [first, last] = await Promise.all([
			this.db.trackedVisitor.findFirst({
				where: { id: { in: visitorIds }, firstSource: { not: null } },
				orderBy: { firstTouchAt: "asc" },
			}),
			this.db.trackedVisitor.findFirst({
				where: { id: { in: visitorIds }, lastSource: { not: null } },
				orderBy: { lastTouchAt: "desc" },
			}),
		]);

		const [grouped, latest, views] = await Promise.all([
			this.db.trackedEvent.groupBy({
				by: ["host", "path"],
				where: { visitorId: { in: visitorIds }, type: "page_view" },
				_count: { _all: true },
				_max: { occurredAt: true },
				orderBy: { _count: { path: "desc" } },
				take: 10,
			}),
			this.db.trackedEvent.findFirst({
				where: { visitorId: { in: visitorIds } },
				orderBy: { occurredAt: "desc" },
				select: { occurredAt: true },
			}),
			this.db.trackedEvent.count({
				where: { visitorId: { in: visitorIds }, type: "page_view" },
			}),
		]);

		return {
			identified: true,
			visitors: visitorIds.length,
			views,
			lastSeenAt: latest?.occurredAt.toISOString() ?? null,
			pages: grouped.flatMap((row) =>
				row._max.occurredAt
					? [
							{
								host: row.host,
								path: row.path,
								views: row._count._all,
								lastSeenAt: row._max.occurredAt.toISOString(),
							},
						]
					: [],
			),
			firstTouch: first
				? summarise({
						source: first.firstSource,
						medium: first.firstMedium,
						campaign: first.firstCampaign,
						landing: first.firstLanding,
						referrer: first.firstReferrer,
						at: first.firstTouchAt,
					})
				: null,
			lastTouch: last
				? summarise({
						source: last.lastSource,
						medium: last.lastMedium,
						campaign: last.lastCampaign,
						landing: last.lastLanding,
						referrer: last.lastReferrer,
						at: last.lastTouchAt,
					})
				: null,
		};
	}

	async sources(userId: string): Promise<SourceRow[]> {
		await this.assertCanManage(userId);

		const [views, contacts] = await Promise.all([
			this.db.trackedEvent.groupBy({
				by: ["source", "medium"],
				where: { type: "page_view", source: { not: null } },
				_count: { _all: true },
			}),
			this.db.$queryRaw<
				{ firstSource: string; firstMedium: string | null; contacts: bigint }[]
			>`
				SELECT "firstSource", "firstMedium", count(DISTINCT "contactId") AS contacts
				FROM "trackedVisitor"
				WHERE "contactId" IS NOT NULL AND "firstSource" IS NOT NULL
				GROUP BY 1, 2;
			`,
		]);

		const rows = new Map<string, SourceRow>();

		for (const row of views) {
			if (!row.source) continue;
			const key = `${row.source}|${row.medium ?? ""}`;
			rows.set(key, {
				source: row.source,
				medium: row.medium,
				views: row._count._all,
				contacts: 0,
			});
		}

		for (const row of contacts) {
			if (!row.firstSource) continue;
			const key = `${row.firstSource}|${row.firstMedium ?? ""}`;
			const existing = rows.get(key);
			const count = Number(row.contacts);

			if (existing) {
				existing.contacts = count;
				continue;
			}

			rows.set(key, {
				source: row.firstSource,
				medium: row.firstMedium,
				views: 0,
				contacts: count,
			});
		}

		return [...rows.values()]
			.sort((a, b) => b.contacts - a.contacts || b.views - a.views)
			.slice(0, 20);
	}

	private async assertCanManage(userId: string): Promise<void> {
		if (!canManageTracking(await this.roleOf(userId))) {
			throw new ForbiddenException(
				"Only an owner or an admin can change tracking.",
			);
		}
	}

	private async roleOf(userId: string): Promise<WorkspaceRole | null> {
		const member = await this.db.member.findFirst({
			where: { organizationId: WORKSPACE_ID, userId },
			select: { role: true },
		});

		return member && isWorkspaceRole(member.role) ? member.role : null;
	}
}

function summarise(touch: {
	source: string | null;
	medium: string | null;
	campaign: string | null;
	landing: string | null;
	referrer: string | null;
	at: Date | null;
}): TouchSummary | null {
	if (!touch.source) return null;

	return {
		label: describeTouch(touch),
		source: touch.source,
		medium: touch.medium,
		campaign: touch.campaign,
		landing: touch.landing,
		referrer: touch.referrer,
		at: touch.at?.toISOString() ?? null,
	};
}

function scriptUrl(): string {
	return loaderUrl(appUrl);
}

function snippet(siteId: string): string {
	return trackingSnippet(appUrl, siteId);
}

function absolute(input: string): URL | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	const withScheme = /^https?:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	try {
		const url = new URL(withScheme);
		return url.hostname.includes(".") ? url : null;
	} catch {
		return null;
	}
}

function mentions(body: string, siteId: string): boolean {
	return body.includes(siteId) && /\/t\/crm\.js/.test(body);
}
