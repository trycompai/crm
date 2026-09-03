import type {
	ContactDetails,
	DetailSource,
	Outcome,
	Person,
	Phone,
	Provider,
} from "./contact-details";
import { CONTACT_DETAILS } from "./contact-details-config";
import { domainOf } from "./names";

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const MAILTO = /href\s*=\s*["']mailto:([^"'?]+)/gi;
const TEL = /href\s*=\s*["']tel:([^"']+)/gi;
const LINKEDIN_ANCHOR =
	/<a\b[^>]*href\s*=\s*["']([^"']*linkedin\.com\/in\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const OBFUSCATED_AT = /\s*[([{]\s*at\s*[)\]}]\s*/gi;
const OBFUSCATED_DOT = /\s*[([{]\s*dot\s*[)\]}]\s*/gi;
const DROPPED_BLOCKS = /<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi;

export type WebPage = {
	url: string;
	html: string;
};

type Sighting = {
	page: WebPage;
	namesPerson: boolean;
	emails: string[];
	phones: string[];
	linkedinUrl: string | null;
};

export function fold(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function letters(value: string): string {
	return fold(value).replace(/[^a-z0-9]/g, "");
}

function decodeEntities(html: string): string {
	return html
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&nbsp;/g, " ");
}

export function textOf(html: string): string {
	const stripped = html.replace(DROPPED_BLOCKS, " ").replace(/<[^>]+>/g, " ");
	return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

function onDomain(email: string, domain: string): boolean {
	const host = domainOf(email);
	return host === domain || Boolean(host?.endsWith(`.${domain}`));
}

export function emailsIn(html: string, domain: string): string[] {
	const text = textOf(html)
		.replace(OBFUSCATED_AT, "@")
		.replace(OBFUSCATED_DOT, ".");
	const linked = [...html.matchAll(MAILTO)].map((match) =>
		decodeEntities(match[1] ?? ""),
	);
	const written = text.match(EMAIL) ?? [];

	const found = [...linked, ...written]
		.map((email) => email.trim().toLowerCase())
		.filter((email) => onDomain(email, domain));

	return [...new Set(found)];
}

export function phonesIn(html: string): string[] {
	const found = [...html.matchAll(TEL)].map((match) =>
		decodeURIComponent(match[1] ?? "").replace(/[^\d+]/g, ""),
	);
	return [...new Set(found.filter((number) => number.length >= 6))];
}

function fullNameForms(person: Person): string[] {
	const first = fold(person.firstName).trim();
	const last = fold(person.lastName).trim();
	return [`${first} ${last}`, `${last} ${first}`].filter(
		(form) => form.trim().length > 0,
	);
}

export function mentionsPerson(html: string, person: Person): boolean {
	const text = fold(textOf(html)).replace(/\s+/g, " ");
	return fullNameForms(person).some((form) => text.includes(form));
}

export function localPartNamesPerson(local: string, person: Person): boolean {
	const first = letters(person.firstName);
	const last = letters(person.lastName);
	const handle = letters(local);
	if (!handle || !last) return false;

	const initial = first.slice(0, 1);
	const forms = first
		? [
				`${first}${last}`,
				`${last}${first}`,
				`${initial}${last}`,
				`${last}${initial}`,
			]
		: [last];

	return forms.includes(handle);
}

export function linkedinFor(html: string, person: Person): string | null {
	const forms = fullNameForms(person);
	for (const match of html.matchAll(LINKEDIN_ANCHOR)) {
		const label = fold(textOf(match[2] ?? "")).replace(/\s+/g, " ");
		if (forms.some((form) => label.includes(form))) {
			return decodeEntities(match[1] ?? "");
		}
	}
	return null;
}

export function robotsAllows(robots: string, path: string): boolean {
	let applies = false;
	let allowed = true;

	for (const raw of robots.split(/\r?\n/)) {
		const line = raw.replace(/#.*$/, "").trim();
		if (!line) continue;

		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const field = line.slice(0, colon).trim().toLowerCase();
		const value = line.slice(colon + 1).trim();

		if (field === "user-agent") {
			applies = value === "*";
			continue;
		}
		if (!applies || field !== "disallow" || !value) continue;
		if (path.startsWith(value)) allowed = false;
	}

	return allowed;
}

export async function fetchPage(url: URL): Promise<Outcome<WebPage>> {
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(),
		CONTACT_DETAILS.website.timeoutMs,
	);

	try {
		const response = await fetch(url, {
			headers: {
				"user-agent": CONTACT_DETAILS.website.userAgent,
				accept: "text/html",
			},
			redirect: "follow",
			signal: controller.signal,
		});
		if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };

		const type = response.headers.get("content-type") ?? "";
		if (!type.includes("text/html") && !type.includes("text/plain")) {
			return { ok: false, reason: `Not a page: ${type || "no content type"}` };
		}

		const html = (await response.text()).slice(
			0,
			CONTACT_DETAILS.website.maxBytes,
		);
		return { ok: true, data: { url: url.toString(), html } };
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Timed out after ${CONTACT_DETAILS.website.timeoutMs}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

async function readRobots(base: URL): Promise<string> {
	const robots = await fetchPage(new URL("/robots.txt", base));
	return robots.ok ? robots.data.html : "";
}

export async function readSite(person: Person): Promise<WebPage[]> {
	const base = new URL(`https://${person.domain.trim().toLowerCase()}`);
	const robots = await readRobots(base);

	const paths = CONTACT_DETAILS.website.paths
		.filter((path) => robotsAllows(robots, path))
		.slice(0, CONTACT_DETAILS.website.maxPages);

	const pages = await Promise.all(
		paths.map((path) => fetchPage(new URL(path, base))),
	);

	return pages.flatMap((page) => (page.ok ? [page.data] : []));
}

function sightingOf(page: WebPage, person: Person): Sighting {
	return {
		page,
		namesPerson: mentionsPerson(page.html, person),
		emails: emailsIn(page.html, person.domain.trim().toLowerCase()),
		phones: phonesIn(page.html),
		linkedinUrl: linkedinFor(page.html, person),
	};
}

function sourceOf(page: WebPage, seenOn: string): DetailSource {
	return { url: page.url, domain: new URL(page.url).hostname, seenOn };
}

function phonesOf(sightings: Sighting[]): Phone[] {
	const numbers = new Set(sightings.flatMap((s) => s.phones));
	return [...numbers].map((number) => ({ number, type: "main" }));
}

export function detailsFrom(pages: WebPage[], person: Person): ContactDetails {
	const seenOn = new Date().toISOString().slice(0, 10);
	const sightings = pages.map((page) => sightingOf(page, person));
	const named = sightings.filter((s) => s.namesPerson);
	const linkedinUrl = sightings.find((s) => s.linkedinUrl)?.linkedinUrl ?? null;

	const emailPages = new Map<string, Sighting[]>();
	for (const sighting of sightings) {
		for (const email of sighting.emails) {
			const local = email.slice(0, email.lastIndexOf("@"));
			const surnameOnly = letters(local) === letters(person.lastName);
			const matches =
				localPartNamesPerson(local, person) ||
				(surnameOnly && sighting.namesPerson);
			if (!matches) continue;
			emailPages.set(email, [...(emailPages.get(email) ?? []), sighting]);
		}
	}

	const [email, where] = [...emailPages.entries()][0] ?? [null, []];
	if (email) {
		return {
			provider: "website",
			email,
			confidence: CONTACT_DETAILS.website.confidence.named,
			phones: phonesOf(where.length > 0 ? where : named),
			title: null,
			linkedinUrl,
			sources: where
				.slice(0, CONTACT_DETAILS.maxSources)
				.map((s) => sourceOf(s.page, seenOn)),
			reference: null,
		};
	}

	const phones = phonesOf(named.length > 0 ? sightings : []);
	return {
		provider: "website",
		email: null,
		confidence:
			phones.length > 0 ? CONTACT_DETAILS.website.confidence.phoneOnly : 0,
		phones,
		title: null,
		linkedinUrl,
		sources: named
			.slice(0, CONTACT_DETAILS.maxSources)
			.map((s) => sourceOf(s.page, seenOn)),
		reference: null,
	};
}

export async function findOnWebsite(
	person: Person,
): Promise<Outcome<ContactDetails>> {
	if (!person.lastName.trim()) {
		return { ok: false, reason: "No last name to look for." };
	}

	const pages = await readSite(person);
	if (pages.length === 0) {
		return { ok: false, reason: `No readable page on ${person.domain}.` };
	}

	return { ok: true, data: detailsFrom(pages, person) };
}

export const website: Provider = {
	id: "website",
	label: "Company website",
	keys: [],
	enabled: () => true,
	find: findOnWebsite,
};
