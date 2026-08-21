import { toDay } from "@crm/ui/lib/format";
import { connection } from "next/server";
import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
} from "@/components/page-shell";
import { ViewerDayProvider } from "@/components/viewer-day";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { DashboardSummary } from "./dashboard-summary";
import {
	OverviewGreeting,
	OverviewGreetingFallback,
} from "./overview-greeting";
import {
	OverviewScopeToggle,
	OverviewScopeToggleFallback,
} from "./overview-scope";
import { loadOverviewSearchParams } from "./overview-search-params";

export default function OverviewPage({ searchParams }: PageProps<"/[slug]">) {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<Suspense fallback={<OverviewGreetingFallback />}>
						<OverviewGreeting />
					</Suspense>
				</PageShellHeading>
				<PageShellActions>
					<Suspense fallback={<OverviewScopeToggleFallback />}>
						<OverviewScopeToggle />
					</Suspense>
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Summary searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Summary({
	searchParams,
}: Pick<PageProps<"/[slug]">, "searchParams">) {
	await connection();
	const [, { scope }] = await Promise.all([
		requireSession(),
		loadOverviewSearchParams(searchParams),
	]);

	const queryClient = getServerQueryClient();
	const today = toDay(new Date());
	await queryClient.prefetchQuery(
		getServerTrpc().dashboard.summary.queryOptions({
			scope,
			today,
		}),
	);

	return (
		<HydrateClient>
			<ViewerDayProvider initialDay={today}>
				<DashboardSummary />
			</ViewerDayProvider>
		</HydrateClient>
	);
}
