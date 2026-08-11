import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { prospectsSearchParams } from "./prospects-search-params";
import { FindMoreLeadsButton, GrowthPulse } from "./growth-controls";
import { ProspectsTable } from "./prospects-table";
import { ResearchGapsButton } from "./research-gaps-button";

export const metadata: Metadata = {
	title: "Prospects",
};

export default function ProspectsPage({
	searchParams,
}: PageProps<"/[slug]/prospects">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Prospects</PageShellTitle>
					<PageShellDescription>
						Work the next move from public demand to a named buyer and sales
						account.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<FindMoreLeadsButton />
					<ResearchGapsButton />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<div className="flex min-h-0 flex-1 flex-col gap-3">
						<GrowthPulse />
						<Prospects searchParams={searchParams} />
					</div>
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Prospects({
	searchParams,
}: Pick<PageProps<"/[slug]/prospects">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		prospectsSearchParams.load(searchParams),
	]);
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.prospects.list.queryOptions(prospectsSearchParams.toInput(values)),
	);
	await Promise.all([
		queryClient.prefetchQuery(trpc.outreach.supplyStatus.queryOptions()),
		queryClient.prefetchQuery(trpc.outreach.performance.queryOptions()),
	]);

	return (
		<HydrateClient>
			<ProspectsTable />
		</HydrateClient>
	);
}
