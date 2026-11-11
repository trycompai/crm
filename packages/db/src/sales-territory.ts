import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Sales territory map — assign a rep from company name + bill-to geo.
 *
 * Ops rule: exception → US state / CA province / international → unmatched.
 * Unmatched (null) means the shared Screening claim pool.
 */

export type TerritoryRep = {
	rep_code: string;
	rep_name: string;
	email: string | null;
	sage_user_id?: string;
	django_user_id?: number;
	initials_confirmed?: boolean;
	notes?: string;
};

export type TerritoryAccount = {
	name: string;
	aliases?: string[];
	mas_customer_nos?: string[];
	/** Short names (Digi) — word-boundary match when true. Default false = substring. */
	wordBoundary?: boolean;
};

export type TerritoryMap = {
	reps: Record<string, TerritoryRep>;
	us_states: Record<string, string>;
	canada_provinces: Record<string, string>;
	international: Record<string, { rep_code: string; label: string }>;
	exceptions: {
		illinois_key_accounts: {
			rep_code: string;
			accounts: TerritoryAccount[];
		};
		gateway_mfrs: {
			rep_code: string;
			accounts: TerritoryAccount[];
		};
		distributors: Array<
			TerritoryAccount & {
				rep_code?: string;
				/** Ambiguous shared ownership — treat as unmatched. */
				rep_codes?: string[];
			}
		>;
	};
};

export type AssignRepInput = {
	companyName?: string | null;
	/** US state or Canadian province code (e.g. PA, ON). */
	stateCode?: string | null;
	/** ISO-ish country or region key (US, CA, MX, APAC, ME). */
	countryCode?: string | null;
};

export type AssignRepResult = {
	repCode: string;
	email: string;
	reason: "exception" | "geo" | "international";
};

let cachedMap: TerritoryMap | null = null;

function findWorkspaceRoot(start: string): string | null {
	let directory = resolve(start);
	for (;;) {
		const manifest = join(directory, "package.json");
		if (existsSync(manifest)) {
			try {
				const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
				if (
					typeof parsed === "object" &&
					parsed !== null &&
					"workspaces" in parsed
				) {
					return directory;
				}
			} catch {
				// keep walking
			}
		}
		const parent = dirname(directory);
		if (parent === directory) return null;
		directory = parent;
	}
}

/** Load `data/sales-territory.json` from the monorepo root (cached). */
export function loadSalesTerritory(root?: string): TerritoryMap {
	if (cachedMap && !root) return cachedMap;

	const workspace =
		root ??
		findWorkspaceRoot(process.cwd()) ??
		findWorkspaceRoot(import.meta.dir);
	if (!workspace) {
		throw new Error("Could not find workspace root for sales-territory.json.");
	}

	const path = join(workspace, "data", "sales-territory.json");
	const map = JSON.parse(readFileSync(path, "utf8")) as TerritoryMap;
	if (!root) cachedMap = map;
	return map;
}

/** Reset cache — tests only. */
export function clearSalesTerritoryCache(): void {
	cachedMap = null;
}

function normalizeName(value: string): string {
	return value.trim().toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ");
}

function nameMatches(
	haystack: string,
	account: TerritoryAccount,
	forceWordBoundary: boolean,
): boolean {
	const needle = normalizeName(haystack);
	if (!needle) return false;

	const labels = [account.name, ...(account.aliases ?? [])];
	for (const label of labels) {
		const target = normalizeName(label);
		if (!target) continue;
		const useBoundary =
			forceWordBoundary || account.wordBoundary === true || target.length <= 4;
		if (useBoundary) {
			const pattern = new RegExp(
				`(^|[^a-z0-9])${escapeRegex(target)}([^a-z0-9]|$)`,
				"i",
			);
			if (pattern.test(needle)) return true;
		} else if (needle.includes(target)) {
			return true;
		}
	}
	return false;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveEmail(map: TerritoryMap, repCode: string): string | null {
	const rep = map.reps[repCode];
	if (!rep?.email) return null;
	return rep.email.trim().toLowerCase();
}

/**
 * Cascade: exception → US/CA geo → international → null (shared pool).
 * Skips reps without an email. MCA multi-rep → null.
 */
export function assignRep(
	map: TerritoryMap,
	input: AssignRepInput,
): AssignRepResult | null {
	const company = input.companyName?.trim() ?? "";

	if (company) {
		const key = map.exceptions.illinois_key_accounts;
		for (const account of key.accounts) {
			if (nameMatches(company, account, false)) {
				const email = resolveEmail(map, key.rep_code);
				if (email) {
					return { repCode: key.rep_code, email, reason: "exception" };
				}
			}
		}

		const gateways = map.exceptions.gateway_mfrs;
		for (const account of gateways.accounts) {
			if (nameMatches(company, account, account.name.length <= 4)) {
				const email = resolveEmail(map, gateways.rep_code);
				if (email) {
					return { repCode: gateways.rep_code, email, reason: "exception" };
				}
			}
		}

		for (const dist of map.exceptions.distributors) {
			if (!nameMatches(company, dist, dist.name.length <= 4)) continue;
			if (dist.rep_codes && dist.rep_codes.length > 1) {
				return null;
			}
			const code = dist.rep_code ?? dist.rep_codes?.[0];
			if (!code) return null;
			const email = resolveEmail(map, code);
			if (email) return { repCode: code, email, reason: "exception" };
			return null;
		}
	}

	const state = input.stateCode?.trim().toUpperCase() ?? "";
	const country = input.countryCode?.trim().toUpperCase() ?? "";

	if (
		country === "US" ||
		country === "USA" ||
		(!country && state && map.us_states[state])
	) {
		const code = state ? map.us_states[state] : undefined;
		if (code) {
			const email = resolveEmail(map, code);
			if (email) return { repCode: code, email, reason: "geo" };
		}
	}

	if (country === "CA" || country === "CAN" || country === "CANADA") {
		const code = state ? map.canada_provinces[state] : undefined;
		if (code) {
			const email = resolveEmail(map, code);
			if (email) return { repCode: code, email, reason: "geo" };
		}
	}

	const intlKey =
		country || (state && map.international[state] ? state : "") || "";
	if (intlKey && map.international[intlKey]) {
		const code = map.international[intlKey].rep_code;
		const email = resolveEmail(map, code);
		if (email) return { repCode: code, email, reason: "international" };
	}

	return null;
}

/**
 * Is this company on the distributor exception list, independent of rep
 * resolution? Used for the `is_distributor` field on the order-defaults
 * endpoint — a distributor can still resolve to a shared/ambiguous rep
 * (`rep_codes` with more than one entry), so this cannot be derived from
 * `assignRep`'s return value alone.
 */
export function isDistributor(
	map: TerritoryMap,
	companyName?: string | null,
): boolean {
	const company = companyName?.trim() ?? "";
	if (!company) return false;

	return map.exceptions.distributors.some((account) =>
		nameMatches(company, account, account.name.length <= 4),
	);
}

const US_STATE_NAMES: Record<string, string> = {
	alabama: "AL",
	alaska: "AK",
	arizona: "AZ",
	arkansas: "AR",
	california: "CA",
	colorado: "CO",
	connecticut: "CT",
	delaware: "DE",
	florida: "FL",
	georgia: "GA",
	hawaii: "HI",
	idaho: "ID",
	illinois: "IL",
	indiana: "IN",
	iowa: "IA",
	kansas: "KS",
	kentucky: "KY",
	louisiana: "LA",
	maine: "ME",
	maryland: "MD",
	massachusetts: "MA",
	michigan: "MI",
	minnesota: "MN",
	mississippi: "MS",
	missouri: "MO",
	montana: "MT",
	nebraska: "NE",
	nevada: "NV",
	"new hampshire": "NH",
	"new jersey": "NJ",
	"new mexico": "NM",
	"new york": "NY",
	"north carolina": "NC",
	"north dakota": "ND",
	ohio: "OH",
	oklahoma: "OK",
	oregon: "OR",
	pennsylvania: "PA",
	"rhode island": "RI",
	"south carolina": "SC",
	"south dakota": "SD",
	tennessee: "TN",
	texas: "TX",
	utah: "UT",
	vermont: "VT",
	virginia: "VA",
	washington: "WA",
	"west virginia": "WV",
	wisconsin: "WI",
	wyoming: "WY",
	"district of columbia": "DC",
	"puerto rico": "PR",
};

const CA_PROVINCE_NAMES: Record<string, string> = {
	alberta: "AB",
	"british columbia": "BC",
	manitoba: "MB",
	"new brunswick": "NB",
	"newfoundland and labrador": "NL",
	newfoundland: "NL",
	"northwest territories": "NT",
	"nova scotia": "NS",
	nunavut: "NU",
	ontario: "ON",
	"prince edward island": "PE",
	quebec: "QC",
	saskatchewan: "SK",
	yukon: "YT",
};

/**
 * Infer state/country from webform location + zone + comments.
 * Best-effort — unknown → empty fields → shared pool.
 */
export function inferGeoFromForm(input: {
	locationText?: string | null;
	connectLocation?: string | null;
	comments?: string | null;
}): { stateCode?: string; countryCode?: string } {
	const blob = [input.locationText, input.connectLocation, input.comments]
		.filter(Boolean)
		.join("\n");
	const lower = blob.toLowerCase();

	if (/\bmexico\b|\bméxico\b|\bmx\b/.test(lower)) {
		return { countryCode: "MX" };
	}
	if (/\bbrazil\b|\bbrasil\b/.test(lower)) {
		return { countryCode: "BR" };
	}
	if (/\bargentina\b/.test(lower)) {
		return { countryCode: "AR" };
	}
	if (/\bchile\b/.test(lower)) {
		return { countryCode: "CL" };
	}
	if (/\bperu\b|\bperú\b/.test(lower)) {
		return { countryCode: "PE" };
	}
	if (
		/\basia pacific\b|\bapac\b|\bjapan\b|\bkorea\b|\bchina\b|\bindia\b|\baustralia\b|\bsingapore\b/.test(
			lower,
		)
	) {
		return { countryCode: "APAC" };
	}
	if (/\bmiddle east\b|\bu\.?a\.?e\.?\b|\bsaudi\b|\bisrael\b/.test(lower)) {
		return { countryCode: "ME" };
	}

	const usStateAbbrev = blob.match(
		/\b([A-Z]{2})\b(?=\s*,?\s*(?:united states|usa|u\.s\.a\.?|us\b)?)/i,
	);
	const commaState = blob.match(/,\s*([A-Za-z]{2})\b/);
	const stateFromAbbrev = (
		usStateAbbrev?.[1] ??
		commaState?.[1] ??
		""
	).toUpperCase();

	for (const [name, code] of Object.entries(US_STATE_NAMES)) {
		if (lower.includes(name)) {
			return { stateCode: code, countryCode: "US" };
		}
	}
	for (const [name, code] of Object.entries(CA_PROVINCE_NAMES)) {
		if (lower.includes(name)) {
			return { stateCode: code, countryCode: "CA" };
		}
	}

	if (stateFromAbbrev.length === 2) {
		if (US_STATE_NAMES_SET.has(stateFromAbbrev)) {
			return { stateCode: stateFromAbbrev, countryCode: "US" };
		}
		if (CA_PROVINCE_SET.has(stateFromAbbrev)) {
			return { stateCode: stateFromAbbrev, countryCode: "CA" };
		}
	}

	if (
		/\bunited states\b|\busa\b|\bu\.s\.a?\b/.test(lower) ||
		/\bnorth america\b/.test(lower)
	) {
		if (stateFromAbbrev && US_STATE_NAMES_SET.has(stateFromAbbrev)) {
			return { stateCode: stateFromAbbrev, countryCode: "US" };
		}
		// North America without a state is not enough to pick a rep.
		if (/\bcanada\b/.test(lower)) {
			return { countryCode: "CA" };
		}
		return { countryCode: "US" };
	}

	if (/\bcanada\b/.test(lower)) {
		return { countryCode: "CA" };
	}

	return {};
}

const US_STATE_NAMES_SET = new Set(Object.values(US_STATE_NAMES));
const CA_PROVINCE_SET = new Set(Object.values(CA_PROVINCE_NAMES));
