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
import { TrackingSections } from "./tracking-sections";

export const metadata: Metadata = {
	title: "Tracking & Analytics",
};

export default function TrackingSettingsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Tracking &amp; Analytics</PageShellTitle>
					<PageShellDescription>
						Track website visitors and automatically add contacts when a form is
						submitted.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Tracking />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Tracking() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const settings = await queryClient.fetchQuery(
		trpc.tracking.settings.queryOptions(),
	);

	if (settings.canManage) {
		await queryClient.prefetchQuery(trpc.tracking.sources.queryOptions());
	}

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<TrackingSections />
			</div>
		</HydrateClient>
	);
}
