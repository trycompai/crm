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

export const APOLLO_API_KEY = "APOLLO_API_KEY";

const phone = z.object({
	sanitized_number: z.string().trim().min(1).nullable().optional(),
	raw_number: z.string().trim().min(1).nullable().optional(),
	type: z.string().nullable().optional(),
});

const match = z.object({
	person: z
		.object({
			id: z.string().nullable().optional(),
			email: z.string().trim().email().nullable().optional(),
			email_status: z.string().nullable().optional(),
			title: z.string().nullable().optional(),
			linkedin_url: z.string().nullable().optional(),
			phone_numbers: z.array(phone).nullable().optional(),
		})
		.nullable()
		.optional(),
});

function confidenceOf(status: string | null | undefined): number {
	const scale = CONTACT_DETAILS.apollo.confidence;
	switch (status) {
		case "verified":
			return scale.verified;
		case "likely_to_engage":
		case "likely":
			return scale.likely;
		case "guessed":
		case "extrapolated":
			return scale.guessed;
		default:
			return scale.unknown;
	}
}

export async function apolloMatch(
	person: Person,
): Promise<Outcome<ContactDetails>> {
	const apiKey = process.env[APOLLO_API_KEY]?.trim();
	if (!apiKey) return { ok: false, reason: `No ${APOLLO_API_KEY}.` };

	const response = await fetchJson(
		new URL(`${CONTACT_DETAILS.apollo.baseUrl}/people/match`),
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify({
				first_name: person.firstName.trim(),
				last_name: person.lastName.trim(),
				domain: person.domain.trim().toLowerCase(),
				organization_name: person.companyName ?? undefined,
				reveal_personal_emails: false,
				reveal_phone_number: false,
			}),
		},
		match,
		"Apollo",
	);
	if (!response.ok) return response;

	const found = response.data.person;
	return {
		ok: true,
		data: {
			provider: "apollo",
			email: found?.email ?? null,
			confidence: found?.email ? confidenceOf(found.email_status) : 0,
			phones: (found?.phone_numbers ?? []).flatMap((entry) => {
				const number = entry.sanitized_number ?? entry.raw_number;
				return number ? [{ number, type: entry.type ?? null }] : [];
			}),
			title: found?.title ?? null,
			linkedinUrl: found?.linkedin_url ?? null,
			sources: [],
			reference: found?.id ?? null,
		},
	};
}

export const apollo: Provider = {
	id: "apollo",
	label: "Apollo",
	keys: [APOLLO_API_KEY],
	enabled: keyed(APOLLO_API_KEY),
	find: apolloMatch,
};
