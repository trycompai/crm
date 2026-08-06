import {
	defaultShouldDehydrateQuery,
	QueryClient,
} from "@tanstack/react-query";

export function makeQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: { staleTime: 30_000, retry: retryQuery },
			dehydrate: {
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) ||
					query.state.status === "pending",
			},
		},
	});
}

function retryQuery(failureCount: number, error: unknown): boolean {
	const data =
		error && typeof error === "object" && "data" in error ? error.data : null;
	const status =
		data && typeof data === "object" && "httpStatus" in data
			? data.httpStatus
			: null;

	if (typeof status === "number" && status >= 400 && status < 500) {
		return false;
	}

	return failureCount < 1;
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
	if (typeof window === "undefined") {
		return makeQueryClient();
	}
	browserQueryClient ??= makeQueryClient();
	return browserQueryClient;
}
