import { type SearchResult, search } from "./context-dev";
import { slugFromProfileUrl } from "./linkdapi";
import { searchTerms } from "./names";

const MAX_CANDIDATES = 5;

export function linkedInSlugsFromText(text: string): string[] {
	const slugs: string[] = [];

	for (const match of text.matchAll(
		/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/gi,
	)) {
		const raw = match[1];
		if (!raw) continue;

		const slug = decodeURIComponent(raw).replace(/\/+$/, "").toLowerCase();
		if (slug && !slugs.includes(slug)) slugs.push(slug);
	}

	return slugs;
}

export function linkedInSlugsFromResults(results: SearchResult[]): string[] {
	const slugs: string[] = [];

	const add = (slug: string | null) => {
		if (!slug) return;
		const normalised = slug.replace(/\/+$/, "").toLowerCase();
		if (normalised && !slugs.includes(normalised)) slugs.push(normalised);
	};

	for (const result of results) {
		add(slugFromProfileUrl(result.url));

		const haystack = [result.title, result.description, result.markdown]
			.filter(Boolean)
			.join("\n");

		for (const slug of linkedInSlugsFromText(haystack)) add(slug);
	}

	return slugs;
}

export function linkedInSearchQuery(term: string, companyName: string): string {
	const company = companyName.trim();
	const quoted = company.includes(" ") ? `"${company}"` : company;
	return `site:linkedin.com/in ${term} ${quoted}`.trim();
}

export async function findLinkedInCandidates(
	email: string,
	companyName: string,
): Promise<{
	searchedFor: string[];
	candidateSlugs: string[];
	note?: string;
}> {
	const local = email.split("@")[0] ?? "";
	const terms = searchTerms(local);
	const slugs: string[] = [];

	for (const term of terms) {
		const outcome = await search(linkedInSearchQuery(term, companyName), {
			limit: 10,
		});

		if (outcome.outcome !== "found") {
			return {
				searchedFor: terms,
				candidateSlugs: [],
				note: outcome.reason,
			};
		}

		for (const slug of linkedInSlugsFromResults(outcome.results)) {
			if (!slugs.includes(slug)) slugs.push(slug);
		}

		if (slugs.length >= MAX_CANDIDATES) break;
	}

	return {
		searchedFor: terms,
		candidateSlugs: slugs.slice(0, MAX_CANDIDATES),
		note:
			slugs.length === 0
				? "No LinkedIn candidates. A miss stays a miss — do not invent a profile."
				: "Unverified. Each slug must be checked with get_linkedin_profile.",
	};
}
