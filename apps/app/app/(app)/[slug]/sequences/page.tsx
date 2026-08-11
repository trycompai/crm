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
import { SequenceList } from "./sequence-list";

export const metadata: Metadata = { title: "Email sequences" };

export default function SequencesPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Email sequences</PageShellTitle>
					<PageShellDescription>
						Review A/B/C proposals, control every send and learn which angle
						creates replies.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<SequenceData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function SequenceData() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(trpc.outreach.sequences.queryOptions()),
		queryClient.prefetchQuery(trpc.outreach.performance.queryOptions()),
	]);
	return (
		<HydrateClient>
			<SequenceList />
		</HydrateClient>
	);
}
