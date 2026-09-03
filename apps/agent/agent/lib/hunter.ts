import { z } from "zod";
import { HUNTER } from "./hunter-config";

export type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

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
		first_name: z.string().nullable().optional(),
		last_name: z.string().nullable().optional(),
		position: z.string().nullable().optional(),
		sources: z.array(source).nullable().optional(),
	}),
});

const verifier = z.object({
	data: z.object({
		status: z.string().trim().min(1),
		score: z.number().nullable().optional(),
	}),
});

export type EmailSource = {
	url: string;
	domain: string | null;
	seenOn: string | null;
};

export type WorkEmail = {
	email: string | null;
	score: number;
	position: string | null;
	sources: EmailSource[];
};

export type Verification = { status: string; score: number | null };

export function hunterEnabled(): boolean {
	return Boolean(process.env[HUNTER_API_KEY]?.trim());
}

async function request<Shape extends z.ZodTypeAny>(
	path: string,
	query: Record<string, string | undefined>,
	shape: Shape,
): Promise<Outcome<z.infer<Shape>>> {
	const apiKey = process.env[HUNTER_API_KEY]?.trim();
	if (!apiKey) return { ok: false, reason: `No ${HUNTER_API_KEY}.` };

	const url = new URL(`${HUNTER.api.baseUrl}${path}`);
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined) url.searchParams.set(key, value);
	}
	url.searchParams.set("api_key", apiKey);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), HUNTER.api.timeoutMs);

	try {
		const response = await fetch(url, { signal: controller.signal });
		if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };

		const parsed = shape.safeParse(await response.json());
		return parsed.success
			? { ok: true, data: parsed.data }
			: {
					ok: false,
					reason: `Unreadable Hunter response: ${parsed.error.message}`,
				};
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `Hunter timed out after ${HUNTER.api.timeoutMs}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

export async function findWorkEmail(input: {
	firstName: string;
	lastName: string;
	domain: string;
}): Promise<Outcome<WorkEmail>> {
	const response = await request(
		"/email-finder",
		{
			domain: input.domain.trim().toLowerCase(),
			first_name: input.firstName.trim(),
			last_name: input.lastName.trim(),
		},
		finder,
	);
	if (!response.ok) return response;

	const { data } = response.data;
	return {
		ok: true,
		data: {
			email: data.email,
			score: data.score ?? 0,
			position: data.position ?? null,
			sources: (data.sources ?? []).slice(0, HUNTER.maxSources).map((s) => ({
				url: s.uri,
				domain: s.domain ?? null,
				seenOn: s.extracted_on ?? null,
			})),
		},
	};
}

export async function verifyEmail(
	email: string,
): Promise<Outcome<Verification>> {
	const response = await request(
		"/email-verifier",
		{ email: email.trim().toLowerCase() },
		verifier,
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
