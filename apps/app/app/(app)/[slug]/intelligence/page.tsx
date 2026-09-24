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
import { IntelligenceInbox } from "./intelligence-inbox";

export const metadata: Metadata = {
	title: "Intelligence",
};

const DEFAULT_INBOX = {
	status: "unresolved" as const,
	limit: 100,
};

export default function IntelligencePage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Intelligence</PageShellTitle>
					<PageShellDescription>
						Review incoming commercial signals before they become CRM records or
						opportunities.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Intelligence />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Intelligence() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(trpc.ingest.inbox.queryOptions(DEFAULT_INBOX)),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
	]);

	return (
		<HydrateClient>
			<IntelligenceInbox initialInput={DEFAULT_INBOX} />
		</HydrateClient>
	);
}
