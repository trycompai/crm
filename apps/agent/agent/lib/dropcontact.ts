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

export const DROPCONTACT_API_KEY = "DROPCONTACT_API_KEY";

const submitted = z.object({
	request_id: z.string().trim().min(1),
});

const email = z.object({
	email: z.string().trim().email(),
	qualification: z.string().nullable().optional(),
});

const row = z.object({
	email: z.array(email).nullable().optional(),
	phone: z.string().nullable().optional(),
	mobile_phone: z.string().nullable().optional(),
	job: z.string().nullable().optional(),
	linkedin: z.string().nullable().optional(),
});

const batch = z.object({
	success: z.boolean(),
	data: z.array(row).nullable().optional(),
});

function confidenceOf(qualification: string | null | undefined): number {
	const scale = CONTACT_DETAILS.dropcontact.confidence;
	const value = (qualification ?? "").toLowerCase();
	if (value.startsWith("nominative")) return scale.nominative;
	if (value.startsWith("catch_all")) return scale.catchAll;
	return scale.other;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function dropcontactEnrich(
	person: Person,
): Promise<Outcome<ContactDetails>> {
	const apiKey = process.env[DROPCONTACT_API_KEY]?.trim();
	if (!apiKey) return { ok: false, reason: `No ${DROPCONTACT_API_KEY}.` };

	const headers = {
		"content-type": "application/json",
		"X-Access-Token": apiKey,
	};
	const base = CONTACT_DETAILS.dropcontact.baseUrl;

	const submit = await fetchJson(
		new URL(`${base}/batch`),
		{
			method: "POST",
			headers,
			body: JSON.stringify({
				data: [
					{
						first_name: person.firstName.trim(),
						last_name: person.lastName.trim(),
						website: person.domain.trim().toLowerCase(),
						company: person.companyName ?? undefined,
					},
				],
				siren: false,
			}),
		},
		submitted,
		"Dropcontact",
	);
	if (!submit.ok) return submit;

	for (let poll = 0; poll < CONTACT_DETAILS.dropcontact.maxPolls; poll++) {
		await wait(CONTACT_DETAILS.dropcontact.pollMs);

		const result = await fetchJson(
			new URL(`${base}/batch/${encodeURIComponent(submit.data.request_id)}`),
			{ headers },
			batch,
			"Dropcontact",
		);
		if (!result.ok) return result;
		if (!result.data.success) continue;

		const found = result.data.data?.[0] ?? null;
		const best = found?.email?.[0] ?? null;
		const phones = [found?.phone, found?.mobile_phone].flatMap(
			(number, index) =>
				number ? [{ number, type: index === 0 ? "work" : "mobile" }] : [],
		);

		return {
			ok: true,
			data: {
				provider: "dropcontact",
				email: best?.email ?? null,
				confidence: best ? confidenceOf(best.qualification) : 0,
				phones,
				title: found?.job ?? null,
				linkedinUrl: found?.linkedin ?? null,
				sources: [],
				reference: submit.data.request_id,
			},
		};
	}

	return {
		ok: false,
		reason: `Dropcontact did not finish within ${CONTACT_DETAILS.dropcontact.maxPolls} polls.`,
	};
}

export const dropcontact: Provider = {
	id: "dropcontact",
	label: "Dropcontact",
	keys: [DROPCONTACT_API_KEY],
	enabled: keyed(DROPCONTACT_API_KEY),
	find: dropcontactEnrich,
};
