import {
	BUNDLE_MAX_AGE_SECONDS,
	LOADER_MAX_AGE_SECONDS,
} from "@crm/db/tracking";
import { LOADER_SOURCE } from "@/lib/tracking/loader";

export function GET(): Response {
	return new Response(LOADER_SOURCE, {
		headers: {
			"content-type": "application/javascript; charset=utf-8",
			"cache-control": `public, max-age=${LOADER_MAX_AGE_SECONDS}, s-maxage=${BUNDLE_MAX_AGE_SECONDS}, immutable`,
			"x-content-type-options": "nosniff",
		},
	});
}
