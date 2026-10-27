import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@crm/ui/components/page-shell";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { AddSsoProviderSheet } from "./add-sso-provider-sheet";
import { ssoSearchParams } from "./sso-search-params";
import { SsoTable } from "./sso-table";

export const metadata: Metadata = {
	title: "SSO",
};

export default function SsoSettingsPage({
	searchParams,
}: PageProps<"/[slug]/settings/sso">) {
	return (
		<PageShell width="narrow" className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>SSO</PageShellTitle>
					<PageShellDescription>
						Let your people sign in through your own identity provider. While
						one is configured, the sign-in page offers it instead of Google.
					</PageShellDescription>
				</PageShellHeading>

				<PageShellActions>
					<AddSsoProviderSheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading shape="settings" />}>
					<Providers searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Providers({
	searchParams,
}: Pick<PageProps<"/[slug]/settings/sso">, "searchParams">) {
	await requireSession();

	const values = await ssoSearchParams.load(searchParams);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(trpc.sso.settings.queryOptions()),
		queryClient.prefetchQuery(
			trpc.sso.list.queryOptions(ssoSearchParams.toInput(values)),
		),
	]);

	return (
		<HydrateClient>
			<SsoTable />
		</HydrateClient>
	);
}
