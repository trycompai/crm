const ALLOWED_PATHS = [
	/^health$/,
	/^companies\/search$/,
	/^companies\/[A-Za-z0-9.-]{1,12}$/,
	/^companies\/[A-Za-z0-9.-]{1,12}\/(filings|owners|insiders|proxy)$/,
	/^filings\/search$/,
	/^compensation\/compare$/,
];

export function edgarUrl(): string | null {
	const url = process.env.EDGAR_URL?.trim();
	return url ? url.replace(/\/+$/, "") : null;
}

export function edgarConfigured(): boolean {
	return edgarUrl() !== null;
}

export function edgarPathAllowed(path: string): boolean {
	return ALLOWED_PATHS.some((pattern) => pattern.test(path));
}

export function edgarTarget(path: string, search: string): URL | null {
	const base = edgarUrl();
	if (!base || !edgarPathAllowed(path)) return null;
	return new URL(`${base}/${path}${search}`);
}

export function edgarHeaders(): HeadersInit {
	const secret = process.env.EDGAR_SECRET?.trim();
	return secret
		? { accept: "application/json", authorization: `Bearer ${secret}` }
		: { accept: "application/json" };
}
