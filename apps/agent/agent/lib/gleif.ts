import { z } from "zod";
import { GLEIF } from "./gleif-config";

export type Outcome<T> = { ok: true; data: T } | { ok: false; reason: string };

const legalName = z.object({ name: z.string().trim().min(1) });

const legalAddress = z.object({
	country: z.string().trim().length(2),
	city: z.string().trim().min(1).nullable().optional(),
});

const otherName = z.object({
	name: z.string().trim().min(1),
	type: z.string().nullable().optional(),
});

const record = z.object({
	id: z.string().trim().length(20),
	attributes: z.object({
		entity: z.object({
			legalName,
			legalAddress,
			otherNames: z.array(otherName).nullable().optional(),
			transliteratedOtherNames: z.array(otherName).nullable().optional(),
			status: z.string().nullable().optional(),
			category: z.string().nullable().optional(),
			jurisdiction: z.string().nullable().optional(),
		}),
		registration: z
			.object({ status: z.string().nullable().optional() })
			.optional(),
	}),
});

const pagination = z.object({
	currentPage: z.number().int(),
	lastPage: z.number().int(),
	total: z.number().int(),
});

const page = z.object({
	data: z.array(record),
	meta: z.object({ pagination }).optional(),
});

const single = z.object({ data: record.nullable() });

export const gleifEntity = record.transform(({ id, attributes }) => ({
	lei: id,
	name: attributes.entity.legalName.name,
	alternativeNames: [
		...new Set(
			[
				...(attributes.entity.otherNames ?? []),
				...(attributes.entity.transliteratedOtherNames ?? []),
			]
				.map((other) => other.name)
				.filter((name) => name !== attributes.entity.legalName.name),
		),
	],
	country: attributes.entity.legalAddress.country.toUpperCase(),
	city: attributes.entity.legalAddress.city ?? null,
	status: attributes.entity.status ?? null,
	registrationStatus: attributes.registration?.status ?? null,
	category: attributes.entity.category ?? null,
	jurisdiction: attributes.entity.jurisdiction ?? null,
}));

export type GleifEntity = z.infer<typeof gleifEntity>;

export type Subsidiaries = {
	parent: string;
	children: GleifEntity[];
	total: number;
	truncated: boolean;
};

export const ENTITY_CATEGORIES = [
	"GENERAL",
	"FUND",
	"BRANCH",
	"SOLE_PROPRIETOR",
	"RESIDENT_GOVERNMENT_ENTITY",
	"INTERNATIONAL_ORGANIZATION",
] as const;

export type EntityCategory = (typeof ENTITY_CATEGORIES)[number];

type Query = Record<string, string | undefined>;

export function resolveCountries(spec: string | undefined): string[] {
	if (!spec) return [];
	const regions: Record<string, readonly string[]> = GLEIF.regions;
	return [
		...new Set(
			spec
				.split(",")
				.map((part) => part.trim().toUpperCase())
				.filter(Boolean)
				.flatMap((part) => regions[part] ?? [part])
				.filter((code) => /^[A-Z]{2}$/.test(code)),
		),
	];
}

function normalizeLei(lei: string): string {
	return encodeURIComponent(lei.trim().toUpperCase());
}

async function request<Shape extends z.ZodTypeAny>(
	path: string,
	query: Query,
	shape: Shape,
	notFound: z.infer<Shape>,
): Promise<Outcome<z.infer<Shape>>> {
	const url = new URL(`${GLEIF.api.baseUrl}${path}`);
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined) url.searchParams.set(key, value);
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), GLEIF.api.timeoutMs);

	try {
		const response = await fetch(url, {
			headers: { accept: "application/vnd.api+json" },
			signal: controller.signal,
		});

		if (response.status === 404) return { ok: true, data: notFound };
		if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };

		const parsed = shape.safeParse(await response.json());
		return parsed.success
			? { ok: true, data: parsed.data }
			: {
					ok: false,
					reason: `Unreadable GLEIF response: ${parsed.error.message}`,
				};
	} catch (error) {
		const aborted = error instanceof Error && error.name === "AbortError";
		return {
			ok: false,
			reason: aborted
				? `GLEIF timed out after ${GLEIF.api.timeoutMs}ms.`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

export async function searchEntities(input: {
	name: string;
	country?: string;
	category?: EntityCategory | "ANY";
	activeOnly?: boolean;
	limit?: number;
}): Promise<Outcome<{ entities: GleifEntity[]; total: number }>> {
	const limit = Math.min(
		input.limit ?? GLEIF.search.defaultLimit,
		GLEIF.search.maxLimit,
	);
	const category = input.category ?? "GENERAL";

	const response = await request(
		"/lei-records",
		{
			"filter[entity.legalName]": input.name.trim(),
			"filter[entity.legalAddress.country]": input.country
				?.trim()
				.toUpperCase(),
			"filter[entity.status]":
				(input.activeOnly ?? true) ? "ACTIVE" : undefined,
			"filter[entity.category]": category === "ANY" ? undefined : category,
			"page[size]": String(limit),
			"page[number]": "1",
		},
		page,
		{ data: [] },
	);
	if (!response.ok) return response;

	return {
		ok: true,
		data: {
			entities: response.data.data.map((row) => gleifEntity.parse(row)),
			total: response.data.meta?.pagination.total ?? response.data.data.length,
		},
	};
}

async function one(path: string): Promise<Outcome<GleifEntity | null>> {
	const response = await request(path, {}, single, { data: null });
	if (!response.ok) return response;

	return {
		ok: true,
		data: response.data.data ? gleifEntity.parse(response.data.data) : null,
	};
}

export function getEntity(lei: string): Promise<Outcome<GleifEntity | null>> {
	return one(`/lei-records/${normalizeLei(lei)}`);
}

export function directParent(
	lei: string,
): Promise<Outcome<GleifEntity | null>> {
	return one(`/lei-records/${normalizeLei(lei)}/direct-parent`);
}

export async function directChildren(
	lei: string,
	options: { countries?: string[] } = {},
): Promise<Outcome<Subsidiaries>> {
	const parent = lei.trim().toUpperCase();
	const wanted = new Set(options.countries ?? []);
	const children: GleifEntity[] = [];
	let total = 0;
	let truncated = false;

	for (let number = 1; number <= GLEIF.api.maxPages; number++) {
		const response = await request(
			`/lei-records/${normalizeLei(parent)}/direct-children`,
			{
				"page[size]": String(GLEIF.api.pageSize),
				"page[number]": String(number),
			},
			page,
			{ data: [] },
		);
		if (!response.ok) return response;

		const meta = response.data.meta?.pagination;
		total = meta?.total ?? response.data.data.length;

		for (const row of response.data.data) {
			const entity = gleifEntity.parse(row);
			if (wanted.size === 0 || wanted.has(entity.country)) {
				children.push(entity);
			}
		}

		if (!meta || number >= meta.lastPage) break;
		if (number === GLEIF.api.maxPages) truncated = true;
	}

	return { ok: true, data: { parent, children, total, truncated } };
}
