import "@crm/env/load";

type AllowList = {
	domains: readonly string[];
	addresses: readonly string[];
};

const EMPTY: AllowList = { domains: [], addresses: [] };

let cachedSource: string | undefined;
let cached: AllowList = EMPTY;

function validHost(value: string): boolean {
	if (value.length > 253) return false;

	const labels = value.split(".");
	return labels.every(
		(label) =>
			label.length > 0 &&
			label.length <= 63 &&
			/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
	);
}

function parseAddress(value: string): { address: string; host: string } | null {
	const separator = value.indexOf("@");
	if (separator <= 0 || separator !== value.lastIndexOf("@")) return null;

	const local = value.slice(0, separator);
	const host = value.slice(separator + 1);
	if (/\s/.test(local) || !validHost(host)) return null;

	return { address: value, host };
}

function allowList(): AllowList {
	const source = process.env.ALLOWED_SIGN_IN ?? "";
	if (source === cachedSource) return cached;

	const domains: string[] = [];
	const addresses: string[] = [];

	for (const raw of source.split(",")) {
		const entry = raw.trim().toLowerCase().replace(/^@/, "");
		if (!entry) continue;

		if (entry.includes("@")) {
			const parsed = parseAddress(entry);
			if (parsed) addresses.push(parsed.address);
		} else if (validHost(entry)) {
			domains.push(entry);
		}
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

export function googleHostedDomainHint(): string | undefined {
	const { domains, addresses } = allowList();
	if (domains[0]) return domains[0];

	const hosts = new Set(
		addresses.map((address) => parseAddress(address)?.host).filter(Boolean),
	);
	return hosts.size === 1 ? [...hosts][0] : undefined;
}

export function hasSignInAllowList(): boolean {
	const { domains, addresses } = allowList();
	return domains.length > 0 || addresses.length > 0;
}

export function isWorkspaceEmail(email: string | null | undefined): boolean {
	const value = email?.trim().toLowerCase();
	if (!value) return false;

	const parsed = parseAddress(value);
	if (!parsed) return false;

	const { domains, addresses } = allowList();

	if (addresses.includes(value)) return true;

	return domains.some(
		(domain) => parsed.host === domain || parsed.host.endsWith(`.${domain}`),
	);
}
