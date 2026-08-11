const MAX_EXTERNAL_URL_LENGTH = 2048;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function safeExternalHref(
	value: string | null | undefined,
): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	if (trimmed.length > MAX_EXTERNAL_URL_LENGTH) return null;
	if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
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

export function safeExternalHost(
	value: string | null | undefined,
): string | null {
	const href = safeExternalHref(value);
	if (!href) return null;
	return new URL(href).hostname.replace(/^www\./, "");
}
