import { CONFIG_MAX_AGE_SECONDS, isSiteId } from "@crm/db/tracking";
import { API_URL } from "@/lib/env";
import { trackerSource } from "@/lib/tracking/tracker";

const EMPTY = "/* no tracking site is configured */\n";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ site: string }> },
): Promise<Response> {
	const { site } = await params;
	const siteId = site.replace(/\.js$/, "");

	if (!isSiteId(siteId)) return empty();

	let payload: { config: unknown; hash?: string } | null = null;

	try {
		const upstream = await fetch(`${API_URL}/api/t/config/${siteId}`, {
			headers: { accept: "application/json" },
		});

		if (upstream.ok) {
			payload = (await upstream.json()) as { config: unknown; hash?: string };
		}
	} catch {
		return empty();
	}

	if (!payload?.config) return empty();

	const origin = new URL(request.url).origin;
	const source = trackerSource(
		payload.config as Parameters<typeof trackerSource>[0],
		`${origin}/api/t/e`,
	);

	return new Response(source, {
		headers: {
			"content-type": "application/javascript; charset=utf-8",
			"cache-control": `public, max-age=${CONFIG_MAX_AGE_SECONDS}, s-maxage=${CONFIG_MAX_AGE_SECONDS}`,
			"x-content-type-options": "nosniff",
			...(payload.hash ? { etag: `"${payload.hash}"` } : {}),
		},
	});
}

function empty(): Response {
	return new Response(EMPTY, {
		headers: {
			"content-type": "application/javascript; charset=utf-8",
			"cache-control": "public, max-age=60, s-maxage=60",
			"x-content-type-options": "nosniff",
		},
	});
}
