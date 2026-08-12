"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { companiesSearchParams } from "@/app/(app)/[slug]/companies/companies-search-params";
import { contactsSearchParams } from "@/app/(app)/[slug]/contacts/contacts-search-params";
import { dealsSearchParams } from "@/app/(app)/[slug]/deals/deals-search-params";
import { tasksSearchParams } from "@/app/(app)/[slug]/tasks/tasks-search-params";
import { useViewerDay } from "@/components/viewer-day";
import { useTRPC } from "@/lib/trpc/client";

export type Section =
	| "/"
	| "/companies"
	| "/contacts"
	| "/deals"
	| "/tasks"
	| "/settings";

export function usePrefetchSection(): (section: string) => void {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const today = useViewerDay();

	return useCallback(
		(section: string) => {
			switch (section) {
				case "/":
					void queryClient.prefetchQuery(
						trpc.dashboard.summary.queryOptions({ scope: "me", today }),
					);
					return;
				case "/companies":
					void queryClient.prefetchQuery(
						trpc.companies.list.queryOptions(
							companiesSearchParams.defaultInput(),
						),
					);
					return;
				case "/contacts":
					void queryClient.prefetchQuery(
						trpc.contacts.list.queryOptions(
							contactsSearchParams.defaultInput(),
						),
					);
					return;
				case "/deals":
					void queryClient.prefetchQuery(
						trpc.deals.list.queryOptions(dealsSearchParams.defaultInput()),
					);
					return;
				case "/tasks":
					void queryClient.prefetchQuery(
						trpc.activities.tasks.queryOptions({
							...tasksSearchParams.defaultInput(),
							today,
						}),
					);
					return;
				default:
					return;
			}
		},
		[trpc, queryClient, today],
	);
}
