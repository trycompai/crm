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
import { toServiceListInput } from "@/lib/service-input";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { serviceSearchParams } from "./service-search-params";
import { ServiceTable } from "./service-table";

export const metadata: Metadata = {
	title: "Service",
};

export default function ServicePage({
	searchParams,
}: PageProps<"/[slug]/service">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Service</PageShellTitle>
					<PageShellDescription>
						Inbound cases, SLA gaps, reply drafts and approval-only customer
						responses.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Service searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Service({
	searchParams,
}: Pick<PageProps<"/[slug]/service">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		serviceSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.service.list.queryOptions(
			toServiceListInput(serviceSearchParams.toInput(values)),
		),
	);

	return (
		<HydrateClient>
			<ServiceTable />
		</HydrateClient>
	);
}
