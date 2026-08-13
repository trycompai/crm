import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateCampaignButton } from "@/components/marketing/create-buttons";
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
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { CampaignsTable } from "./campaigns-table";

export const metadata: Metadata = { title: "Campaigns" };

export default function CampaignsPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Campaigns</PageShellTitle>
					<PageShellDescription>
						One-off sends and multi-step sequences.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateCampaignButton />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Campaigns />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Campaigns() {
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.marketingCampaigns.list.queryOptions({
			q: "",
			sort: "updatedAt",
			dir: "desc",
			page: 1,
			pageSize: 25,
			kind: "",
			status: "",
		}),
	);

	return (
		<HydrateClient>
			<CampaignsTable />
		</HydrateClient>
	);
}
