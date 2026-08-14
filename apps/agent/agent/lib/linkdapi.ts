import { z } from "zod";

const HOST = "linkdapi-best-unofficial-linkedin-api.p.rapidapi.com";
const TIMEOUT_MS = 20_000;

const json = z.json();
const text = z.string().trim().min(1).nullable().catch(null);
const rawText = z.string().nullable().catch(null);
const count = z.number().nullable().catch(null);
const fields = z.record(z.string(), json).catch({});
const optionalFields = z.record(z.string(), json).nullable().catch(null);
const rows = z.array(json).nullable().catch(null);

const envelope = z
	.object({
		success: z.boolean().nullable().catch(null),
		data: json.catch(null),
	})
	.catch({ success: null, data: null });

const experienceEnvelope = z
	.object({ experience: rows, experiences: rows })
	.catch({ experience: null, experiences: null });

const companyLookup = z.object({ companies: rows }).catch({ companies: null });

type Json = z.infer<typeof json>;

export type LinkedinFields = z.infer<typeof fields>;

export type Profile = {
	slug: string;
	profileUrl: string;
	fullName: string | null;
	firstName: string | null;
	lastName: string | null;
	headline: string | null;
	location: string | null;
	urn: string | null;
	followerCount: number | null;
	connectionsCount: number | null;
	photoUrl: string | null;
	positions: { name: string; url: string | null }[];
};

export type Company = {
	id: string | null;
	name: string | null;
	universalName: string | null;
	tagline: string | null;
	description: string | null;
	linkedinUrl: string | null;
};

export type Experience = {
	title: string | null;
	company: string | null;
	dateRange: string | null;
	location: string | null;
};

type Outcome<T> =
	| { ok: true; data: T }
	| { ok: false; missing: true }
	| { ok: false; missing: false; reason: string };

function key(): string | null {
	return process.env.RAPIDAPI_KEY ?? null;
}

export function linkedinEnabled(): boolean {
	return key() !== null;
}

export function slugFromProfileUrl(raw: string | null): string | null {
	if (!raw) return null;

	try {
		const url = new URL(raw.trim());

		const host = url.hostname.toLowerCase();
		if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;

		const [section, slug] = url.pathname.split("/").filter(Boolean);
		if (section !== "in" || !slug) return null;

		return decodeURIComponent(slug);
	} catch {
		return null;
	}
}

export async function getProfile(slug: string): Promise<Outcome<Profile>> {
	const result = await call("/api/v1/profile/overview", { username: slug });
	if (!result.ok) return result;

	const d = fields.parse(result.data);
	return {
		ok: true,
		data: {
			slug,
			profileUrl: `https://www.linkedin.com/in/${slug}`,
			fullName: text.parse(d.fullName),
			firstName: text.parse(d.firstName),
			lastName: text.parse(d.lastName),
			headline: text.parse(d.headline),
			location: text.parse(d.location),
			urn: text.parse(d.urn),
			followerCount: count.parse(d.followerCount),
			connectionsCount: count.parse(d.connectionsCount),
			photoUrl: profilePhotoUrl(d),
			positions: (rows.parse(d.CurrentPositions) ?? []).flatMap((entry) => {
				const position = fields.parse(entry);
				const name = rawText.parse(position.name);
				return name ? [{ name, url: text.parse(position.url) }] : [];
			}),
		},
	};
}

export async function getExperience(
	urn: string,
): Promise<Outcome<Experience[]>> {
	const result = await call("/api/v1/profile/full-experience", { urn });
	if (!result.ok) return result;

	return { ok: true, data: experienceRows(result.data).map(toExperience) };
}

function experienceRows(payload: Json): Json[] {
	if (Array.isArray(payload)) return payload;

	const envelope = experienceEnvelope.parse(payload);
	return envelope.experience ?? envelope.experiences ?? [];
}

function toExperience(row: Json): Experience {
	const entry = fields.parse(row);
	return {
		title: text.parse(entry.title),
		company: text.parse(entry.companyName ?? entry.company),
		dateRange: text.parse(entry.dateRange ?? entry.duration),
		location: text.parse(entry.location),
	};
}

export async function lookupCompany(
	query: string,
): Promise<Outcome<{ id: string; displayName: string }[]>> {
	const result = await call("/api/v1/companies/name-lookup", { query });
	if (!result.ok) return result;

	const companies = companyLookup.parse(result.data).companies ?? [];
	return {
		ok: true,
		data: companies.flatMap((entry) => {
			const company = fields.parse(entry);
			const id = rawText.parse(company.id);
			return id
				? [{ id, displayName: rawText.parse(company.displayName) ?? id }]
				: [];
		}),
	};
}

export async function getCompany(nameOrId: string): Promise<Outcome<Company>> {
	const numeric = /^\d+$/.test(nameOrId);
	const result = await call("/api/v1/companies/company/info", {
		[numeric ? "id" : "name"]: nameOrId,
	});
	if (!result.ok) return result;

	const d = fields.parse(result.data);
	return {
		ok: true,
		data: {
			id: text.parse(d.id),
			name: text.parse(d.name),
			universalName: text.parse(d.universalName),
			tagline: text.parse(d.tagline),
			description: text.parse(d.description),
			linkedinUrl: text.parse(d.linkedinUrl),
		},
	};
}

async function call(
	path: string,
	params: Record<string, string>,
): Promise<Outcome<Json>> {
	const apiKey = key();
	if (!apiKey) return { ok: false, missing: false, reason: "No RAPIDAPI_KEY." };

	const url = new URL(`https://${HOST}${path}`);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			headers: { "x-rapidapi-host": HOST, "x-rapidapi-key": apiKey },
			signal: controller.signal,
		});

		if (!response.ok) {
			return { ok: false, missing: false, reason: `HTTP ${response.status}` };
		}

		const body = envelope.parse(await response.json());

		if (body.success !== true || body.data === null) {
			return { ok: false, missing: true };
		}

		return { ok: true, data: body.data };
	} catch (cause) {
		const aborted = cause instanceof Error && cause.name === "AbortError";
		return {
			ok: false,
			missing: false,
			reason: aborted
				? `Timed out after ${TIMEOUT_MS}ms.`
				: cause instanceof Error
					? cause.message
					: String(cause),
		};
	} finally {
		clearTimeout(timer);
	}
}

const PHOTO_KEYS = [
	"profilePictureURL",
	"profilePicture",
	"profilePictureUrl",
	"profilePicUrl",
	"profilePic",
	"profilePicHighQuality",
	"profilePhotoUrl",
	"profilePhoto",
	"pictureUrl",
	"avatarUrl",
	"avatar",
];

export function profilePhotoUrl(raw: LinkedinFields): string | null {
	const byLowerKey = new Map<string, Json>();
	for (const [key, value] of Object.entries(raw)) {
		byLowerKey.set(key.toLowerCase(), value);
	}

	for (const key of PHOTO_KEYS) {
		const url = firstUrl(byLowerKey.get(key.toLowerCase()));
		if (!url) continue;

		try {
			const { protocol, hostname } = new URL(url);
			if (protocol !== "https:") continue;
			if (hostname !== "licdn.com" && !hostname.endsWith(".licdn.com"))
				continue;
			return url;
		} catch {}
	}

	return null;
}

function firstUrl(value: Json | undefined): string | null {
	if (Array.isArray(value)) {
		for (const entry of [...value].reverse()) {
			const found = firstUrl(entry);
			if (found) return found;
		}
		return null;
	}

	const direct = text.parse(value);
	if (direct) return direct;

	const nested = optionalFields.parse(value);
	if (nested) {
		for (const key of ["url", "displayUrl", "src", "large", "original"]) {
			const found = firstUrl(nested[key]);
			if (found) return found;
		}
	}

	return null;
}
