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
import { ClientsTable } from "./clients-table";
import { CreateClientSheet } from "./create-client-sheet";

export const metadata: Metadata = {
	title: "Clients",
};

export default function ClientsPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Clients</PageShellTitle>
					<PageShellDescription>
						Every agency client and how their engagement is going.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateClientSheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Clients />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Clients() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.clientAccounts.list.queryOptions({
			q: "",
			status: "all",
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 50,
		}),
	);
	return (
		<HydrateClient>
			<ClientsTable />
		</HydrateClient>
	);
}
