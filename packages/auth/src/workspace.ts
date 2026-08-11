import "@crm/env/load";

type AllowList = {
	domains: readonly string[];
	addresses: readonly string[];
};

const EMPTY: AllowList = { domains: [], addresses: [] };

let cachedSource: string | undefined;
let cached: AllowList = EMPTY;
let cachedAliasSource: string | undefined;
let cachedAliases = new Map<string, string>();

function normalizedEmail(email: string | null | undefined): string | undefined {
	const value = email?.trim().toLowerCase();
	if (!value) return undefined;
	const parts = value.split("@");
	if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
	return value;
}

function aliases(): ReadonlyMap<string, string> {
	const source = process.env.SIGN_IN_EMAIL_ALIASES ?? "";
	if (source === cachedAliasSource) return cachedAliases;

	const next = new Map<string, string>();
	for (const raw of source.split(",")) {
		const [aliasRaw, canonicalRaw, ...rest] = raw.split("=");
		if (rest.length > 0) continue;
		const alias = normalizedEmail(aliasRaw);
		const canonical = normalizedEmail(canonicalRaw);
		if (!alias || !canonical || alias === canonical) continue;
		next.set(alias, canonical);
	}

	cachedAliasSource = source;
	cachedAliases = next;
	return cachedAliases;
}

export function canonicalWorkspaceEmail(
	email: string | null | undefined,
): string | undefined {
	const value = normalizedEmail(email);
	if (!value) return undefined;
	return aliases().get(value) ?? value;
}

function allowList(): AllowList {
	const source = process.env.ALLOWED_SIGN_IN ?? "";
	if (source === cachedSource) return cached;

	const domains: string[] = [];
	const addresses: string[] = [];

	for (const raw of source.split(",")) {
		const entry = raw.trim().toLowerCase().replace(/^@/, "");
		if (!entry) continue;
		(entry.includes("@") ? addresses : domains).push(entry);
	}

	cachedSource = source;
	cached = { domains, addresses };
	return cached;
}

export function workspaceDomains(): readonly string[] {
	return allowList().domains;
}

export function primaryWorkspaceDomain(): string | undefined {
	return allowList().domains[0];
}

export function hasSignInAllowList(): boolean {
	const { domains, addresses } = allowList();
	return domains.length > 0 || addresses.length > 0;
}

export function isWorkspaceEmail(email: string | null | undefined): boolean {
	const value = canonicalWorkspaceEmail(email);
	if (!value) return false;

	const parts = value.split("@");
	if (parts.length !== 2) return false;

	const [local, host] = parts;
	if (!local || !host) return false;

	const { domains, addresses } = allowList();

	if (addresses.includes(value)) return true;

	return domains.some(
		(domain) => host === domain || host.endsWith(`.${domain}`),
	);
}
