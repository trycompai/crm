export function apiRequestHeaders(initial?: HeadersInit): Headers {
	const headers = new Headers(initial);
	const bypassSecret = process.env.API_PROTECTION_BYPASS_SECRET;

	if (bypassSecret) {
		headers.set("x-vercel-protection-bypass", bypassSecret);
	}

	return headers;
}
