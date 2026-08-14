import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

const queryFailure = z
	.object({
		data: z
			.object({ httpStatus: z.number().nullable().catch(null) })
			.catch({ httpStatus: null }),
	})
	.catch({ data: { httpStatus: null } });

export function makeQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: { staleTime: 30_000, retry: retryQuery },
		},
	});
}

function retryQuery(failureCount: number, error: Error): boolean {
	const { httpStatus } = queryFailure.parse(error).data;

	if (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) {
		return false;
	}

	return failureCount < 1;
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
	if (globalThis.window === undefined) {
		return makeQueryClient();
	}
	browserQueryClient ??= makeQueryClient();
	return browserQueryClient;
}
