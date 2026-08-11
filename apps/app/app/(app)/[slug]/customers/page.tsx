import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { toCustomerListInput } from "@/lib/customer-input";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { customersSearchParams } from "./customers-search-params";
import { CustomersTable } from "./customers-table";

export const metadata: Metadata = {
	title: "Customers",
};

export default function CustomersPage({
	searchParams,
}: PageProps<"/[slug]/customers">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Customers</PageShellTitle>
					<PageShellDescription>
						Closed-won onboarding, access gaps and dry-run instance discovery.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Customers searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Customers({
	searchParams,
}: Pick<PageProps<"/[slug]/customers">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		customersSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.customers.list.queryOptions(
			toCustomerListInput(customersSearchParams.toInput(values)),
		),
	);

	return (
		<HydrateClient>
			<CustomersTable />
		</HydrateClient>
	);
}
