import "server-only";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import {
	createTRPCOptionsProxy,
	type TRPCOptionsProxy,
} from "@trpc/tanstack-react-query";
import type { AppRouter } from "api/app-router";
import { cookies } from "next/headers";
import { cache } from "react";
import { API_URL } from "@/lib/env";
import { makeQueryClient } from "./query-client";

export const getServerQueryClient = cache(makeQueryClient);

export function getServerTrpcClient(): TRPCClient<AppRouter> {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${API_URL}/api/trpc`,
				headers: async () => {
					const cookie = (await cookies()).toString();
					return cookie ? { cookie } : {};
				},
			}),
		],
	});
}

export function getServerTrpc(): TRPCOptionsProxy<AppRouter> {
	const client = getServerTrpcClient();

	return createTRPCOptionsProxy<AppRouter>({
		client,
		queryClient: getServerQueryClient,
	});
}
