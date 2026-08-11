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
import { GranolaReview } from "./granola-review";

export const metadata: Metadata = { title: "Granola review" };

export default function GranolaReviewPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Granola review</PageShellTitle>
					<PageShellDescription>
						Match customer calls to the right account, or exclude personal notes
						so they stay out of Lode permanently.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<GranolaReviewData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function GranolaReviewData() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(trpc.inbound.granolaReview.queryOptions());
	return (
		<HydrateClient>
			<GranolaReview />
		</HydrateClient>
	);
}
