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

export const LUSHA_API_KEY = "LUSHA_API_KEY";

const email = z.object({
	email: z.string().trim().email(),
	emailType: z.string().nullable().optional(),
});

const phone = z.object({
	number: z.string().trim().min(1),
	phoneType: z.string().nullable().optional(),
});

const contact = z.object({
	jobTitle: z.string().nullable().optional(),
	emailAddresses: z.array(email).nullable().optional(),
	phoneNumbers: z.array(phone).nullable().optional(),
	socialLinks: z
		.object({ linkedin: z.string().nullable().optional() })
		.nullable()
		.optional(),
	id: z.union([z.string(), z.number()]).nullable().optional(),
});

const person = z.object({
	data: z
		.union([z.object({ contact }), contact])
		.nullable()
		.optional(),
});

function unwrap(
	value: z.infer<typeof person>["data"],
): z.infer<typeof contact> | null {
	if (!value) return null;
	return "contact" in value ? value.contact : value;
}

export async function lushaPerson(
	who: Person,
): Promise<Outcome<ContactDetails>> {
	const apiKey = process.env[LUSHA_API_KEY]?.trim();
	if (!apiKey) return { ok: false, reason: `No ${LUSHA_API_KEY}.` };

	const url = new URL(`${CONTACT_DETAILS.lusha.baseUrl}/v2/person`);
	url.searchParams.set("firstName", who.firstName.trim());
	url.searchParams.set("lastName", who.lastName.trim());
	url.searchParams.set("companyDomain", who.domain.trim().toLowerCase());

	const response = await fetchJson(
		url,
		{ headers: { api_key: apiKey } },
		person,
		"Lusha",
	);
	if (!response.ok) return response;

	const found = unwrap(response.data.data);
	const work = (found?.emailAddresses ?? []).find(
		(entry) => (entry.emailType ?? "").toLowerCase() === "work",
	);
	const best = work ?? (found?.emailAddresses ?? [])[0] ?? null;
	const scale = CONTACT_DETAILS.lusha.confidence;

	return {
		ok: true,
		data: {
			provider: "lusha",
			email: best?.email ?? null,
			confidence: best ? (work ? scale.work : scale.other) : 0,
			phones: (found?.phoneNumbers ?? []).map((entry) => ({
				number: entry.number,
				type: entry.phoneType ?? null,
			})),
			title: found?.jobTitle ?? null,
			linkedinUrl: found?.socialLinks?.linkedin ?? null,
			sources: [],
			reference:
				found?.id === undefined || found.id === null ? null : String(found.id),
		},
	};
}

export const lusha: Provider = {
	id: "lusha",
	label: "Lusha",
	keys: [LUSHA_API_KEY],
	enabled: keyed(LUSHA_API_KEY),
	find: lushaPerson,
};
