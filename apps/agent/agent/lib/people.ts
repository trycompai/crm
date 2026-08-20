import { APIError } from "context.dev/core/error";
import type {
	PersonEnrichParams,
	PersonEnrichResponse,
} from "context.dev/resources/people";
import { z } from "zod";
import { CONTEXT } from "./context-config";
import { contextDev, describe } from "./context-dev";

export type EnrichedMatch = PersonEnrichResponse["match"];

export const MATCH_FLOOR = CONTEXT.people.matchFloor;

export type Organisation = {
	name: string | null;
	domain: string | null;
};

export type Role = {
	title: string | null;
	organisation: Organisation;
	startDate: string | null;
	endDate: string | null;
	location: string | null;
	description: string | null;
	isCurrent: boolean;
};

export type Study = {
	institution: Organisation;
	degree: string | null;
	fieldOfStudy: string | null;
	startDate: string | null;
	endDate: string | null;
};

export type Person = {
	firstName: string | null;
	lastName: string | null;
	fullName: string | null;
	bio: string | null;
	location: string | null;
	email: string | null;
	photoUrl: string | null;
	profileUrl: string | null;
	socialUrls: string[];
	websiteUrls: string[];
	skills: string[];
	currentRoles: Role[];
	experience: Role[];
	education: Study[];
};

export type PersonMatch =
	| { outcome: "found"; person: Person }
	| { outcome: "skipped"; reason: string }
	| { outcome: "failed"; reason: string; retryable: boolean };

const text = z.string().trim().min(1).nullable().catch(null);
const flag = z.boolean().nullable().catch(null);
const number = z.number().nullable().catch(null);
const list = z.array(text).catch([]);

const EMPTY_ORGANISATION = { name: null, domain: null };

const organisation = z
	.object({ name: text, domain: text })
	.catch(EMPTY_ORGANISATION);

const partialDate = z
	.object({ year: z.number(), month: number, day: number })
	.nullable()
	.catch(null);

const roleShape = z.object({
	title: text,
	organization: organisation,
	start_date: partialDate,
	end_date: partialDate,
	location: text,
	description: text,
	is_current: flag,
});

const EMPTY_ROLE = {
	title: null,
	organization: EMPTY_ORGANISATION,
	start_date: null,
	end_date: null,
	location: null,
	description: null,
	is_current: null,
};

const educationShape = z.object({
	institution: organisation,
	degree: text,
	field_of_study: text,
	start_date: partialDate,
	end_date: partialDate,
});

const EMPTY_EDUCATION = {
	institution: EMPTY_ORGANISATION,
	degree: null,
	field_of_study: null,
	start_date: null,
	end_date: null,
};

const personShape = z.object({
	name: z
		.object({ first: text, last: text, full: text })
		.catch({ first: null, last: null, full: null }),
	email: text,
	avatar_url: text,
	bio: text,
	location: z
		.object({ display: text, city: text, region: text, country: text })
		.catch({ display: null, city: null, region: null, country: null }),
	social_urls: list,
	website_urls: list,
	skills: list,
	current_role: roleShape.nullable().catch(null),
	experience: z.array(roleShape.catch(EMPTY_ROLE)).catch([]),
	education: z.array(educationShape.catch(EMPTY_EDUCATION)).catch([]),
});

const candidateShape = z.object({
	status: z.literal("candidate"),
	score: z.number(),
	person: personShape,
});

export async function personByProfileUrl(
	profileUrl: string,
): Promise<PersonMatch> {
	const api = await contextDev();
	if (!api) {
		return { outcome: "skipped", reason: "Context.dev is not configured." };
	}

	try {
		const response = await api.people.enrich({
			social_urls: [profileUrl],
			timeoutMS: CONTEXT.timeoutMs,
		});

		return matchFrom(response.match);
	} catch (error) {
		return classify(error);
	}
}

export type IdentityClues = {
	email: string;
	firstName: string | null;
	lastName: string | null;
	companyName: string | null;
	companyDomain: string | null;
};

export async function personByClues(
	clues: IdentityClues,
): Promise<PersonMatch> {
	const api = await contextDev();
	if (!api) {
		return { outcome: "skipped", reason: "Context.dev is not configured." };
	}

	const params: PersonEnrichParams = {
		email: clues.email,
		timeoutMS: CONTEXT.timeoutMs,
	};

	if (clues.firstName) params.name = { first: clues.firstName };
	if (clues.lastName) params.name = { ...params.name, last: clues.lastName };
	if (clues.companyName) params.company = { name: clues.companyName };
	if (clues.companyDomain) {
		params.company = { ...params.company, domain: clues.companyDomain };
	}

	try {
		return matchFrom((await api.people.enrich(params)).match);
	} catch (error) {
		return classify(error);
	}
}

export function matchFrom(match: EnrichedMatch): PersonMatch {
	const candidate = candidateShape.safeParse(match);

	if (!candidate.success) {
		return { outcome: "skipped", reason: "No person matched that profile." };
	}

	if (candidate.data.score < MATCH_FLOOR) {
		return {
			outcome: "skipped",
			reason:
				"Context could not tie a person to that profile firmly enough to be worth reading.",
		};
	}

	return { outcome: "found", person: toPerson(candidate.data.person) };
}

function toPerson(raw: z.infer<typeof personShape>): Person {
	const socialUrls = raw.social_urls.flatMap((url) => (url ? [url] : []));
	const profileUrl = socialUrls.find((url) => slugFromProfileUrl(url) !== null);
	const current = raw.current_role ? [toRole(raw.current_role)] : [];
	const experience = raw.experience.map(toRole);

	return {
		firstName: raw.name.first,
		lastName: raw.name.last,
		fullName: raw.name.full,
		bio: raw.bio,
		location: raw.location.display ?? placeOf(raw.location),
		email: raw.email,
		photoUrl: photoUrl(raw.avatar_url),
		profileUrl: profileUrl ?? null,
		socialUrls,
		websiteUrls: raw.website_urls.flatMap((url) => (url ? [url] : [])),
		skills: raw.skills.flatMap((skill) => (skill ? [skill] : [])),
		currentRoles: current.concat(
			experience.filter(
				(role) =>
					role.isCurrent && !current.some((held) => sameRole(held, role)),
			),
		),
		experience,
		education: raw.education.map(toStudy),
	};
}

function sameRole(held: Role, role: Role): boolean {
	return (
		held.organisation.name === role.organisation.name &&
		held.title === role.title &&
		held.startDate === role.startDate &&
		held.endDate === role.endDate
	);
}

function toRole(raw: z.infer<typeof roleShape>): Role {
	return {
		title: raw.title,
		organisation: raw.organization,
		startDate: dateOf(raw.start_date),
		endDate: dateOf(raw.end_date),
		location: raw.location,
		description: raw.description,
		isCurrent: raw.is_current ?? raw.end_date === null,
	};
}

function toStudy(raw: z.infer<typeof educationShape>): Study {
	return {
		institution: raw.institution,
		degree: raw.degree,
		fieldOfStudy: raw.field_of_study,
		startDate: dateOf(raw.start_date),
		endDate: dateOf(raw.end_date),
	};
}

function placeOf(location: {
	city: string | null;
	region: string | null;
	country: string | null;
}): string | null {
	const parts = [location.city, location.region, location.country].flatMap(
		(part) => (part ? [part] : []),
	);

	return parts.length > 0 ? parts.join(", ") : null;
}

function dateOf(date: z.infer<typeof partialDate>): string | null {
	if (!date) return null;

	const year = String(date.year).padStart(4, "0");
	if (date.month === null) return year;

	const month = String(date.month).padStart(2, "0");
	if (date.day === null) return `${year}-${month}`;

	return `${year}-${month}-${String(date.day).padStart(2, "0")}`;
}

export function photoUrl(raw: string | null): string | null {
	if (!raw) return null;

	try {
		const url = new URL(raw.trim());
		if (url.protocol !== "https:") return null;

		const host = url.hostname.toLowerCase();
		const trusted = CONTEXT.avatarHosts.some(
			(allowed) => host === allowed || host.endsWith(`.${allowed}`),
		);

		return trusted ? url.toString() : null;
	} catch {
		return null;
	}
}

export function slugFromProfileUrl(raw: string | null): string | null {
	if (!raw) return null;

	try {
		const url = new URL(raw.trim());

		const host = url.hostname.toLowerCase();
		if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;

		const [section, slug] = url.pathname.split("/").filter(Boolean);
		if (section !== "in" || !slug) return null;

		return decodeURIComponent(slug);
	} catch {
		return null;
	}
}

function classify(cause: unknown): PersonMatch {
	if (!(cause instanceof APIError)) {
		return { outcome: "failed", reason: describe(cause), retryable: true };
	}

	if (cause.status === 400 || cause.status === 404) {
		return { outcome: "skipped", reason: "No person matched that profile." };
	}

	if (cause.status === 422) {
		return {
			outcome: "skipped",
			reason: "Context will not look that identifier up.",
		};
	}

	if (cause.status === 401 || cause.status === 403) {
		return { outcome: "failed", reason: describe(cause), retryable: false };
	}

	if (cause.status === 408 || cause.status === 429) {
		return { outcome: "failed", reason: describe(cause), retryable: true };
	}

	return {
		outcome: "failed",
		reason: describe(cause),
		retryable: (cause.status ?? 500) >= 500,
	};
}
