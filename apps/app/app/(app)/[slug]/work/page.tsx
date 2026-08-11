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
import type { RouterInputs } from "@/lib/trpc/types";
import { workSearchParams } from "./work-search-params";
import { WorkTable } from "./work-table";

export const metadata: Metadata = {
	title: "Work",
};

export default function WorkPage({ searchParams }: PageProps<"/[slug]/work">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Work</PageShellTitle>
					<PageShellDescription>
						A shared register of the next operator-owned actions.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Work searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Work({
	searchParams,
}: Pick<PageProps<"/[slug]/work">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		workSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(
			trpc.work.list.queryOptions(
				workSearchParams.toInput(values) as RouterInputs["work"]["list"],
			),
		),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
	]);

	return (
		<HydrateClient>
			<WorkTable />
		</HydrateClient>
	);
}
