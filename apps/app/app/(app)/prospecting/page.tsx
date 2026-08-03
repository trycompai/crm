import type { ProductKey, ProspectStatus } from "@crm/db";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { ListSearch } from "@/components/data-table/list-search";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ProspectingControls } from "./prospecting-controls";
import { prospectingSearchParams } from "./prospecting-search-params";
import { ProspectingTable } from "./prospecting-table";

export const metadata: Metadata = { title: "Prospecting" };

export default async function ProspectingPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	await requireSession();
	const values = await prospectingSearchParams.load(searchParams);
	const input = prospectingSearchParams.toInput(values);
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(
			trpc.prospecting.list.queryOptions({
				...input,
				product: input.product as ProductKey | "all",
				status: input.status as ProspectStatus | "all",
			}),
		),
		queryClient.prefetchQuery(trpc.prospecting.products.queryOptions()),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
	]);

	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Prospecting</PageShellTitle>
					<PageShellDescription>
						Discover, review and contact new customers for all three products.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<ListSearch placeholder="Search prospects, companies or domains…" />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0 gap-6">
				<HydrateClient>
					<ProspectingControls />
					<ProspectingTable />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
