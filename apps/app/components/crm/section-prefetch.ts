"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { companiesSearchParams } from "@/app/(app)/[slug]/companies/companies-search-params";
import { contactsSearchParams } from "@/app/(app)/[slug]/contacts/contacts-search-params";
import { customersSearchParams } from "@/app/(app)/[slug]/customers/customers-search-params";
import { dealsSearchParams } from "@/app/(app)/[slug]/deals/deals-search-params";
import { marketingSearchParams } from "@/app/(app)/[slug]/marketing/marketing-search-params";
import { prospectsSearchParams } from "@/app/(app)/[slug]/prospects/prospects-search-params";
import { serviceSearchParams } from "@/app/(app)/[slug]/service/service-search-params";
import { toCustomerListInput } from "@/lib/customer-input";
import { toMarketingListInput } from "@/lib/marketing-input";
import { toServiceListInput } from "@/lib/service-input";
import { useTRPC } from "@/lib/trpc/client";

export type Section =
	| "/"
	| "/companies"
	| "/calendar"
	| "/contacts"
	| "/customers"
	| "/deals"
	| "/marketing"
	| "/prospects"
	| "/service"
	| "/sequences"
	| "/settings";

export function usePrefetchSection(): (section: string) => void {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return useCallback(
		(section: string) => {
			switch (section) {
				case "/":
					void queryClient.prefetchQuery(
						trpc.dashboard.summary.queryOptions({ scope: "me" }),
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
				case "/customers":
					void queryClient.prefetchQuery(
						trpc.customers.list.queryOptions(
							toCustomerListInput(customersSearchParams.defaultInput()),
						),
					);
					return;
				case "/deals":
					void queryClient.prefetchQuery(
						trpc.deals.list.queryOptions(dealsSearchParams.defaultInput()),
					);
					return;
				case "/prospects":
					void queryClient.prefetchQuery(
						trpc.prospects.list.queryOptions(
							prospectsSearchParams.defaultInput(),
						),
					);
					return;
				case "/service":
					void queryClient.prefetchQuery(
						trpc.service.list.queryOptions(
							toServiceListInput(serviceSearchParams.defaultInput()),
						),
					);
					return;
				case "/marketing":
					void queryClient.prefetchQuery(
						trpc.marketing.list.queryOptions(
							toMarketingListInput(marketingSearchParams.defaultInput()),
						),
					);
					return;
				case "/calendar":
					void queryClient.prefetchQuery(trpc.calendar.agenda.queryOptions());
					return;
				case "/sequences":
					void queryClient.prefetchQuery(
						trpc.outreach.sequences.queryOptions(),
					);
					return;
				default:
					return;
			}
		},
		[trpc, queryClient],
	);
}
