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
import { toMarketingListInput } from "@/lib/marketing-input";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { marketingSearchParams } from "./marketing-search-params";
import { MarketingTable } from "./marketing-table";

export const metadata: Metadata = {
	title: "Marketing",
};

export default function MarketingPage({
	searchParams,
}: PageProps<"/[slug]/marketing">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Marketing</PageShellTitle>
					<PageShellDescription>
						Campaign plans, content variants, publication proposals, UTMs and
						attribution with publishing disabled.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Marketing searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Marketing({
	searchParams,
}: Pick<PageProps<"/[slug]/marketing">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		marketingSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.marketing.list.queryOptions(
			toMarketingListInput(marketingSearchParams.toInput(values)),
		),
	);

	return (
		<HydrateClient>
			<MarketingTable />
		</HydrateClient>
	);
}
