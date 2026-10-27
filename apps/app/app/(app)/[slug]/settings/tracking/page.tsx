import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@crm/ui/components/page-shell";
import { SettingsColumn } from "@crm/ui/components/settings-card";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { TrackingSections } from "./tracking-sections";

export const metadata: Metadata = {
	title: "Tracking & Analytics",
};

export default function TrackingSettingsPage() {
	return (
		<PageShell width="narrow">
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
				<Suspense fallback={<PageShellLoading shape="settings" />}>
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
			<SettingsColumn>
				<TrackingSections />
			</SettingsColumn>
		</HydrateClient>
	);
}
