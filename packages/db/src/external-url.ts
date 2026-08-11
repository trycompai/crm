const MAX_EXTERNAL_URL_LENGTH = 2048;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const SOCIAL_HOSTS = {
	linkedin: ["linkedin.com"],
	x: ["x.com", "twitter.com"],
	github: ["github.com"],
} as const;

export type SocialUrlKind = keyof typeof SOCIAL_HOSTS;

export function normalizeExternalHttpUrl(
	value: string | null | undefined,
): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	if (trimmed.length > MAX_EXTERNAL_URL_LENGTH) return null;
	if (hasControlCharacter(trimmed)) return null;
	if (/^[/?#]/.test(trimmed)) return null;

	let url: URL;
	try {
		url = new URL(SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
	} catch {
		return null;
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") return null;
	if (!url.hostname) return null;
	if (url.username || url.password) return null;

	return url.toString();
}

export function normalizeSocialUrl(
	value: string | null | undefined,
	kind: SocialUrlKind,
): string | null {
	const normalized = normalizeExternalHttpUrl(value);
	if (!normalized) return null;

	const hostname = new URL(normalized).hostname.toLowerCase();
	if (
		!SOCIAL_HOSTS[kind].some(
			(host) => hostname === host || hostname.endsWith(`.${host}`),
		)
	) {
		return null;
	}

	return normalized;
}

function hasControlCharacter(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code <= 31 || code === 127) return true;
	}
	return false;
}
