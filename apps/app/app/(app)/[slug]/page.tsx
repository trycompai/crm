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
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { TodayDesk } from "./today-desk";
import { loadTodaySearchParams } from "./today-search-params";

export const metadata: Metadata = { title: "Today" };

export default function OverviewPage({ searchParams }: PageProps<"/[slug]">) {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Today</PageShellTitle>
					<PageShellDescription>
						A calm operating desk for what needs attention now.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Today searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Today({
	searchParams,
}: Pick<PageProps<"/[slug]">, "searchParams">) {
	const [, { approval }] = await Promise.all([
		requireSession(),
		loadTodaySearchParams(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const queries = [
		queryClient.prefetchQuery(trpc.today.get.queryOptions({ limit: 25 })),
	];
	if (approval) {
		queries.push(
			queryClient.prefetchQuery(
				trpc.approval.detail.queryOptions({ id: approval }),
			),
		);
	}
	await Promise.all(queries);

	return (
		<HydrateClient>
			<TodayDesk />
		</HydrateClient>
	);
}
