import type { z } from "zod";
import { CONTACT_DETAILS } from "./contact-details-config";

export type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

export type ProviderId = (typeof CONTACT_DETAILS.order)[number];

export type DetailSource = {
	url: string;
	domain: string | null;
	seenOn: string | null;
};

export type Phone = { number: string; type: string | null };

export type ContactDetails = {
	provider: ProviderId;
	email: string | null;
	confidence: number;
	phones: Phone[];
	title: string | null;
	linkedinUrl: string | null;
	sources: DetailSource[];
	reference: string | null;
};

export type Person = {
	firstName: string;
	lastName: string;
	domain: string;
	companyName: string | null;
};

export type Provider = {
	id: ProviderId;
	label: string;
	keys: readonly string[];
	enabled: () => boolean;
	find: (person: Person) => Promise<Outcome<ContactDetails>>;
};

export type Lookup =
	| { outcome: "found"; details: ContactDetails; tried: ProviderId[] }
	| { outcome: "none"; tried: ProviderId[]; reasons: string[] }
	| { outcome: "unconfigured" };

export function keyed(...names: string[]): () => boolean {
	return () => names.every((name) => Boolean(process.env[name]?.trim()));
}

export async function fetchJson<Shape extends z.ZodTypeAny>(
	url: URL,
	init: RequestInit,
	shape: Shape,
	label: string,
): Promise<Outcome<z.infer<Shape>>> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), CONTACT_DETAILS.timeoutMs);

	try {
		const response = await fetch(url, { ...init, signal: controller.signal });
		if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };

		const parsed = shape.safeParse(await response.json());
		return parsed.success
			? { ok: true, data: parsed.data }
			: {
					ok: false,
					reason: `Unreadable ${label} response: ${parsed.error.message}`,
				};
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `${label} timed out after ${CONTACT_DETAILS.timeoutMs}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

export function configuredProviders(all: readonly Provider[]): Provider[] {
	return CONTACT_DETAILS.order.flatMap((id) => {
		const provider = all.find((candidate) => candidate.id === id);
		return provider?.enabled() ? [provider] : [];
	});
}

export async function lookupContactDetails(
	person: Person,
	all: readonly Provider[],
): Promise<Lookup> {
	const providers = configuredProviders(all);
	if (providers.length === 0) return { outcome: "unconfigured" };

	const tried: ProviderId[] = [];
	const reasons: string[] = [];

	for (const provider of providers) {
		tried.push(provider.id);
		const result = await provider.find(person);

		if (!result.ok) {
			reasons.push(`${provider.label}: ${result.reason}`);
			continue;
		}

		const { data } = result;
		if (data.email && data.confidence >= CONTACT_DETAILS.minConfidence) {
			return { outcome: "found", details: data, tried };
		}
		if (data.phones.length > 0 && !data.email) {
			return { outcome: "found", details: data, tried };
		}

		reasons.push(
			data.email
				? `${provider.label}: ${data.email} at confidence ${data.confidence}, below ${CONTACT_DETAILS.minConfidence}`
				: `${provider.label}: nothing for this person`,
		);
	}

	return { outcome: "none", tried, reasons };
}
