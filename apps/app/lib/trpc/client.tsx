"use client";

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import {
	createTRPCContext,
	type TRPCOptionsProxy,
} from "@trpc/tanstack-react-query";
import type { AppRouter } from "api/app-router";
import type { FC, ReactNode } from "react";
import { useState } from "react";
import { getQueryClient } from "./query-client";

const { TRPCProvider: ContextProvider, useTRPC: useTRPCContext } =
	createTRPCContext<AppRouter>();

const TRPCProvider: FC<{
	children: ReactNode;
	queryClient: QueryClient;
	trpcClient: TRPCClient<AppRouter>;
	keyPrefix?: never;
}> = ContextProvider;

export const useTRPC: () => TRPCOptionsProxy<AppRouter> = useTRPCContext;

export function TRPCReactProvider({ children }: { children: ReactNode }) {
	const queryClient = getQueryClient();
	const [trpcClient] = useState(() =>
		createTRPCClient<AppRouter>({
			links: [httpBatchLink({ url: "/api/trpc" })],
		}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
				{children}
				{process.env.NEXT_PUBLIC_QUERY_DEVTOOLS === "1" ? (
					<ReactQueryDevtools initialIsOpen={false} />
				) : null}
			</TRPCProvider>
		</QueryClientProvider>
	);
}
