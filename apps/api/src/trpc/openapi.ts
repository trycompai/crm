import type { OpenApiMeta } from "trpc-to-openapi";

export const REST_BRIDGE_PATH = "/rest";

export type RestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export function restMeta(
	method: RestMethod,
	path: `/${string}`,
	tags: string[],
	options: { protect?: boolean } = {},
): OpenApiMeta {
	return {
		openapi: {
			method,
			path,
			tags,
			protect: options.protect ?? true,
		},
	};
}
