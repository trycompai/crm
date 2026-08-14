import { z } from "zod";
import { extract, type JsonSchema } from "./context-dev";
import { getProfile, slugFromProfileUrl } from "./linkdapi";
import { namesMatch } from "./names";

export type PortraitSource = "linkedin" | "github" | "employer-site";

export type PortraitCandidate = {
	source: PortraitSource;
	url: string;
};

export type PortraitSubject = {
	id: string;
	name: string | null;
	linkedinUrl: string | null;
	githubUrl: string | null;
	companyName: string | null;
	companyDomain: string | null;
};

export async function findPortrait(
	subject: PortraitSubject,
	spend: (units?: number) => { ok: boolean; reason?: string },
): Promise<
	| { found: true; candidate: PortraitCandidate }
	| { found: false; tried: string[]; reason?: string }
> {
	const tried: string[] = [];

	if (subject.linkedinUrl) {
		const slug = slugFromProfileUrl(subject.linkedinUrl);
		if (slug) {
			const charge = spend();
			if (!charge.ok) return { found: false, tried, reason: charge.reason };

			const result = await getProfile(slug);
			if (result.ok && result.data.photoUrl) {
				return {
					found: true,
					candidate: { source: "linkedin", url: result.data.photoUrl },
				};
			}
			tried.push(
				result.ok
					? "LinkedIn profile has no picture"
					: "LinkedIn profile could not be read",
			);
		}
	}

	const login = githubLogin(subject.githubUrl);
	if (login) {
		return {
			found: true,
			candidate: {
				source: "github",
				url: `https://github.com/${encodeURIComponent(login)}.png?size=460`,
			},
		};
	}

	if (subject.companyDomain && subject.name) {
		const charge = spend(2);
		if (!charge.ok) return { found: false, tried, reason: charge.reason };

		const fromSite = await fromEmployerSite(subject);
		if (fromSite) return { found: true, candidate: fromSite };
		tried.push("Not on the company's own site");
	}

	return { found: false, tried };
}

const TEAM_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		people: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: { type: "string" },
					title: { type: "string" },
					photoUrl: {
						type: "string",
						description: "Absolute URL of this person's headshot.",
					},
				},
				required: ["name"],
			},
		},
	},
	required: ["people"],
};

const teamPage = z
	.object({
		people: z
			.array(
				z
					.object({
						name: z.string().nullable().catch(null),
						photoUrl: z.string().nullable().catch(null),
					})
					.catch({ name: null, photoUrl: null }),
			)
			.catch([]),
	})
	.catch({ people: [] });

async function fromEmployerSite(
	subject: PortraitSubject,
): Promise<PortraitCandidate | null> {
	const result = await extract(
		`https://${subject.companyDomain}`,
		TEAM_SCHEMA,
		`Find the team, people, about or leadership page for ${subject.companyName ?? subject.companyDomain}. ` +
			"List every named person shown with a headshot, giving the photograph's absolute URL. " +
			"Do not include stock photography, customer logos, or people who are not staff.",
	);

	if (result.outcome !== "found") return null;

	for (const person of teamPage.parse(result.data).people) {
		const { name, photoUrl } = person;
		if (!name || !photoUrl) continue;
		if (!namesMatch(name, subject.name)) continue;

		try {
			const parsed = new URL(photoUrl);
			if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
			return { source: "employer-site", url: parsed.toString() };
		} catch {}
	}

	return null;
}

function githubLogin(raw: string | null): string | null {
	if (!raw) return null;

	try {
		const url = new URL(raw.trim());
		const host = url.hostname.toLowerCase().replace(/^www\./, "");
		if (host !== "github.com") return null;

		const segments = url.pathname.split("/").filter(Boolean);
		if (segments.length !== 1) return null;

		return segments[0] ?? null;
	} catch {
		return null;
	}
}
