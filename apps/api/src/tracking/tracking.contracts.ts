import { z } from "zod";

export const trackingFlagInput = z.object({
	flag: z.enum([
		"crossDomain",
		"limitToDomains",
		"cookieSubdomains",
		"secureCookies",
		"honourDnt",
		"paused",
	]),
	enabled: z.boolean(),
});

export const cookieLifetimeInput = z.object({
	days: z.number().int().min(0).max(400),
});

export const addDomainInput = z.object({
	host: z.string().min(1).max(253),
	scope: z.enum(["SITE_AND_SUBDOMAINS", "EXACT_HOST"]).default("EXACT_HOST"),
});

export const removeDomainInput = z.object({
	id: z.string().min(1),
});

export const verifyInput = z.object({
	url: z.string().min(1).max(2048),
});

export const companyActivityInput = z.object({
	companyId: z.string().min(1),
});

export const contactActivityInput = z.object({
	contactId: z.string().min(1),
});

const domainScopeOutput = z.enum(["SITE_AND_SUBDOMAINS", "EXACT_HOST"]);

export const trackedDomainOutput = z.object({
	id: z.string(),
	host: z.string(),
	scope: domainScopeOutput,
	pageViews: z.number(),
	lastSeenAt: z.string().nullable(),
});

export const trackingSettingsOutput = z.object({
	siteId: z.string().nullable(),
	ready: z.boolean(),
	scriptUrl: z.string(),
	snippet: z.string().nullable(),
	tagManagerSnippet: z.string().nullable(),
	crossDomain: z.boolean(),
	limitToDomains: z.boolean(),
	cookieSubdomains: z.boolean(),
	secureCookies: z.boolean(),
	honourDnt: z.boolean(),
	cookieDays: z.number(),
	paused: z.boolean(),
	cookieLifetimes: z.array(z.object({ days: z.number(), label: z.string() })),
	domains: z.array(trackedDomainOutput),
	receivingSince: z.string().nullable(),
	pageViews: z.number(),
	submissions: z.number(),
	canManage: z.boolean(),
});

export const rotateSiteIdOutput = z.object({
	siteId: z.string(),
});

const foundInContainerOutput = z.object({
	id: z.string(),
	carriesSiteId: z.boolean(),
});

export const verifyOutput = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("found"),
		host: z.string(),
		responseMs: z.number(),
		allowed: z.boolean(),
		pageView: z.boolean(),
		container: foundInContainerOutput.nullable(),
	}),
	z.object({
		status: z.literal("missing"),
		host: z.string(),
		responseMs: z.number(),
		containers: z.array(z.string()),
	}),
	z.object({
		status: z.literal("unreachable"),
		host: z.string(),
		detail: z.string(),
	}),
]);

export const sourceRowOutput = z.object({
	source: z.string(),
	medium: z.string().nullable(),
	views: z.number(),
	contacts: z.number(),
});

export const sourcesOutput = z.array(sourceRowOutput);

const touchSummaryOutput = z.object({
	label: z.string(),
	source: z.string(),
	medium: z.string().nullable(),
	campaign: z.string().nullable(),
	landing: z.string().nullable(),
	referrer: z.string().nullable(),
	at: z.string().nullable(),
});

const visitedPageOutput = z.object({
	host: z.string(),
	path: z.string(),
	views: z.number(),
	lastSeenAt: z.string(),
});

export const websiteActivityOutput = z.object({
	identified: z.boolean(),
	visitors: z.number(),
	views: z.number(),
	lastSeenAt: z.string().nullable(),
	pages: z.array(visitedPageOutput),
	firstTouch: touchSummaryOutput.nullable(),
	lastTouch: touchSummaryOutput.nullable(),
});

export type TrackedDomainRow = z.infer<typeof trackedDomainOutput>;
export type TrackingSettings = z.infer<typeof trackingSettingsOutput>;
export type FoundInContainer = z.infer<typeof foundInContainerOutput>;
export type VerifyResult = z.infer<typeof verifyOutput>;
export type SourceRow = z.infer<typeof sourceRowOutput>;
export type TouchSummary = z.infer<typeof touchSummaryOutput>;
export type VisitedPage = z.infer<typeof visitedPageOutput>;
export type WebsiteActivity = z.infer<typeof websiteActivityOutput>;
