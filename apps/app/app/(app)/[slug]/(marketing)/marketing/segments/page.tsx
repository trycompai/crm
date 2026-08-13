import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateSegmentButton } from "@/components/marketing/create-buttons";
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
import { SegmentsTable } from "./segments-table";

export const metadata: Metadata = { title: "Segments" };

export default function SegmentsPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Segments</PageShellTitle>
					<PageShellDescription>
						Rules, people added manually, or both. Every campaign shares them.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateSegmentButton />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Segments />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Segments() {
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.marketingSegments.list.queryOptions({
			q: "",
			sort: "updatedAt",
			dir: "desc",
			page: 1,
			pageSize: 25,
		}),
	);

	return (
		<HydrateClient>
			<SegmentsTable />
		</HydrateClient>
	);
}
