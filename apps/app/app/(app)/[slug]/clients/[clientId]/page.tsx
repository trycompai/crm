import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellLoading,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ClientDetail } from "./client-detail";

export default async function ClientPage({
	params,
}: {
	params: Promise<{ slug: string; clientId: string }>;
}) {
	const { clientId } = await params;
	if (!clientId) notFound();

	return (
		<PageShell className="min-h-0">
			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Load clientId={clientId} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Load({ clientId }: { clientId: string }) {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.clientAccounts.byId.queryOptions({ id: clientId }),
	);
	return (
		<HydrateClient>
			<ClientDetail clientId={clientId} />
		</HydrateClient>
	);
}
