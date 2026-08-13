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
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { MarketingOverview } from "./overview";

export const metadata: Metadata = { title: "Marketing" };

export default function MarketingOverviewPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Marketing</PageShellTitle>
					<PageShellDescription>
						What is running, and what it did.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Overview />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Overview() {
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.marketingCampaigns.overview.queryOptions(),
	);

	return (
		<HydrateClient>
			<MarketingOverview />
		</HydrateClient>
	);
}
