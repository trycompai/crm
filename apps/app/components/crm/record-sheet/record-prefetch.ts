"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/lib/trpc/client";
import type { RecordRef } from "./record-stack";

export function usePrefetchRecord() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return useCallback(
		({ kind, id }: RecordRef) => {
			switch (kind) {
				case "company":
					void queryClient.prefetchQuery(
						trpc.companies.byId.queryOptions({ id }),
					);
					return;
				case "contact":
					void queryClient.prefetchQuery(
						trpc.contacts.byId.queryOptions({ id }),
					);
					return;
				case "deal":
					void queryClient.prefetchQuery(trpc.deals.byId.queryOptions({ id }));
					return;
				case "prospect":
					void queryClient.prefetchQuery(
						trpc.prospects.byId.queryOptions({ id }),
					);
					return;
			}
		},
		[trpc, queryClient],
	);
}
