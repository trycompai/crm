import type { Metadata } from "next";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { GoogleConnection } from "./google-connection";

export const metadata: Metadata = {
	title: "Connections",
};

export default async function ConnectionsSettingsPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string | string[] }>;
}) {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const [{ error }] = await Promise.all([
		searchParams,
		queryClient.prefetchQuery(trpc.google.status.queryOptions()),
	]);

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Connections</PageShellTitle>
					<PageShellDescription>
						Your meetings and email, on the companies they belong to.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<HydrateClient>
					<div className="flex max-w-3xl flex-col gap-6">
						<GoogleConnection
							connectError={Array.isArray(error) ? error[0] : error}
						/>
					</div>
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
