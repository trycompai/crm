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
import { toInstancesListInput } from "@/lib/instances-input";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { instancesSearchParams } from "./instances-search-params";
import { InstancesTable } from "./instances-table";

export const metadata: Metadata = {
	title: "Instances",
};

export default function InstancesPage({
	searchParams,
}: PageProps<"/[slug]/instances">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Instances</PageShellTitle>
					<PageShellDescription>
						Read-only customer instance census, observed state, dry-run plans,
						operations, incidents, usage and cost.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Instances searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Instances({
	searchParams,
}: Pick<PageProps<"/[slug]/instances">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		instancesSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.instances.list.queryOptions(
			toInstancesListInput(instancesSearchParams.toInput(values)),
		),
	);

	return (
		<HydrateClient>
			<InstancesTable />
		</HydrateClient>
	);
}
