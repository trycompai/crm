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
import { GoogleConnection } from "./google-connection";
import { MicrosoftConnection } from "./microsoft-connection";

export const metadata: Metadata = {
	title: "Connections",
};

export default function ConnectionsSettingsPage({
	searchParams,
}: PageProps<"/[slug]/settings/connections">) {
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
				<Suspense fallback={<PageShellLoading />}>
					<Connections searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Connections({
	searchParams,
}: Pick<PageProps<"/[slug]/settings/connections">, "searchParams">) {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const [{ error, provider }] = await Promise.all([
		searchParams,
		queryClient.prefetchQuery(trpc.google.status.queryOptions()),
		queryClient.prefetchQuery(trpc.microsoft.status.queryOptions()),
	]);

	const connectError = first(error);
	const failed = first(provider);

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<GoogleConnection
					connectError={failed === "google" ? connectError : undefined}
				/>

				<MicrosoftConnection
					connectError={failed === "microsoft" ? connectError : undefined}
				/>
			</div>
		</HydrateClient>
	);
}

function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
