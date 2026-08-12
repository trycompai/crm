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
