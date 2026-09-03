import { z } from "zod";
import {
	type ContactDetails,
	fetchJson,
	keyed,
	type Outcome,
	type Person,
	type Phone,
	type Provider,
} from "./contact-details";
import { CONTACT_DETAILS } from "./contact-details-config";

export const ZOOMINFO_USERNAME = "ZOOMINFO_USERNAME";
export const ZOOMINFO_PASSWORD = "ZOOMINFO_PASSWORD";

const authenticated = z.object({ jwt: z.string().trim().min(1) });

const hit = z.object({
	id: z.union([z.string(), z.number()]).nullable().optional(),
	email: z.string().trim().email().nullable().optional(),
	phone: z.string().nullable().optional(),
	directPhone: z.string().nullable().optional(),
	mobilePhone: z.string().nullable().optional(),
	jobTitle: z.string().nullable().optional(),
});

const enriched = z.object({
	success: z.boolean().optional(),
	data: z
		.object({
			result: z
				.array(z.object({ data: z.array(hit).nullable().optional() }))
				.nullable()
				.optional(),
		})
		.nullable()
		.optional(),
});

let session: { username: string; jwt: string; expiresAt: number } | null = null;

async function token(): Promise<Outcome<string>> {
	const username = process.env[ZOOMINFO_USERNAME]?.trim();
	const password = process.env[ZOOMINFO_PASSWORD]?.trim();
	if (!username || !password) {
		return {
			ok: false,
			reason: `No ${ZOOMINFO_USERNAME} and ${ZOOMINFO_PASSWORD}.`,
		};
	}

	if (session?.username === username && session.expiresAt > Date.now()) {
		return { ok: true, data: session.jwt };
	}

	const response = await fetchJson(
		new URL(`${CONTACT_DETAILS.zoominfo.baseUrl}/authenticate`),
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ username, password }),
		},
		authenticated,
		"ZoomInfo",
	);
	if (!response.ok) return response;

	session = {
		username,
		jwt: response.data.jwt,
		expiresAt: Date.now() + CONTACT_DETAILS.zoominfo.tokenTtlMs,
	};
	return { ok: true, data: session.jwt };
}

export function forgetZoomInfoSession(): void {
	session = null;
}

export async function zoominfoEnrich(
	person: Person,
): Promise<Outcome<ContactDetails>> {
	const jwt = await token();
	if (!jwt.ok) return jwt;

	const response = await fetchJson(
		new URL(`${CONTACT_DETAILS.zoominfo.baseUrl}/enrich/contact`),
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${jwt.data}`,
			},
			body: JSON.stringify({
				matchPersonInput: [
					{
						firstName: person.firstName.trim(),
						lastName: person.lastName.trim(),
						companyName: person.companyName ?? undefined,
						companyWebsite: person.domain.trim().toLowerCase(),
					},
				],
				outputFields: [
					"id",
					"email",
					"phone",
					"directPhone",
					"mobilePhone",
					"jobTitle",
				],
			}),
		},
		enriched,
		"ZoomInfo",
	);
	if (!response.ok) return response;

	const found = response.data.data?.result?.[0]?.data?.[0] ?? null;
	const phones: Phone[] = [];
	if (found?.directPhone)
		phones.push({ number: found.directPhone, type: "direct" });
	if (found?.mobilePhone)
		phones.push({ number: found.mobilePhone, type: "mobile" });
	if (found?.phone) phones.push({ number: found.phone, type: "work" });

	return {
		ok: true,
		data: {
			provider: "zoominfo",
			email: found?.email ?? null,
			confidence: found?.email
				? CONTACT_DETAILS.zoominfo.confidence.matched
				: 0,
			phones,
			title: found?.jobTitle ?? null,
			linkedinUrl: null,
			sources: [],
			reference:
				found?.id === undefined || found?.id === null ? null : String(found.id),
		},
	};
}

export const zoominfo: Provider = {
	id: "zoominfo",
	label: "ZoomInfo",
	keys: [ZOOMINFO_USERNAME, ZOOMINFO_PASSWORD],
	enabled: keyed(ZOOMINFO_USERNAME, ZOOMINFO_PASSWORD),
	find: zoominfoEnrich,
};
