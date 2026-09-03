import { z } from "zod";
import {
	type ContactDetails,
	fetchJson,
	keyed,
	type Outcome,
	type Person,
	type Provider,
} from "./contact-details";
import { CONTACT_DETAILS } from "./contact-details-config";

export const HUNTER_API_KEY = "HUNTER_API_KEY";

const source = z.object({
	uri: z.string().trim().min(1),
	domain: z.string().trim().min(1).nullable().optional(),
	extracted_on: z.string().trim().min(1).nullable().optional(),
});

const finder = z.object({
	data: z.object({
		email: z.string().trim().email().nullable(),
		score: z.number().nullable().optional(),
		position: z.string().nullable().optional(),
		linkedin_url: z.string().nullable().optional(),
		sources: z.array(source).nullable().optional(),
	}),
});

const verifier = z.object({
	data: z.object({
		status: z.string().trim().min(1),
		score: z.number().nullable().optional(),
	}),
});

export type Verification = { status: string; score: number | null };

export function hunterEnabled(): boolean {
	return keyed(HUNTER_API_KEY)();
}

function endpoint(path: string, query: Record<string, string>): URL {
	const url = new URL(`${CONTACT_DETAILS.hunter.baseUrl}${path}`);
	for (const [key, value] of Object.entries(query)) {
		url.searchParams.set(key, value);
	}
	url.searchParams.set("api_key", process.env[HUNTER_API_KEY]?.trim() ?? "");
	return url;
}

export async function findWorkEmail(
	person: Person,
): Promise<Outcome<ContactDetails>> {
	if (!hunterEnabled()) return { ok: false, reason: `No ${HUNTER_API_KEY}.` };

	const response = await fetchJson(
		endpoint("/email-finder", {
			domain: person.domain.trim().toLowerCase(),
			first_name: person.firstName.trim(),
			last_name: person.lastName.trim(),
		}),
		{},
		finder,
		"Hunter",
	);
	if (!response.ok) return response;

	const { data } = response.data;
	return {
		ok: true,
		data: {
			provider: "hunter",
			email: data.email,
			confidence: data.score ?? 0,
			phones: [],
			title: data.position ?? null,
			linkedinUrl: data.linkedin_url ?? null,
			sources: (data.sources ?? [])
				.slice(0, CONTACT_DETAILS.maxSources)
				.map((s) => ({
					url: s.uri,
					domain: s.domain ?? null,
					seenOn: s.extracted_on ?? null,
				})),
			reference: null,
		},
	};
}

export async function verifyEmail(
	email: string,
): Promise<Outcome<Verification>> {
	if (!hunterEnabled()) return { ok: false, reason: `No ${HUNTER_API_KEY}.` };

	const response = await fetchJson(
		endpoint("/email-verifier", { email: email.trim().toLowerCase() }),
		{},
		verifier,
		"Hunter",
	);
	if (!response.ok) return response;

	return {
		ok: true,
		data: {
			status: response.data.data.status,
			score: response.data.data.score ?? null,
		},
	};
}

export const hunter: Provider = {
	id: "hunter",
	label: "Hunter",
	keys: [HUNTER_API_KEY],
	enabled: hunterEnabled,
	find: findWorkEmail,
};
