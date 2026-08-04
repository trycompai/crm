import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { AddSsoProviderSheet } from "./add-sso-provider-sheet";
import { ssoSearchParams } from "./sso-search-params";
import { SsoTable } from "./sso-table";

export const metadata: Metadata = {
	title: "SSO",
};

export default async function SsoSettingsPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
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
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>SSO</PageShellTitle>
					<PageShellDescription>
						Let your people sign in through your own identity provider. While
						one is configured, the sign-in page offers it instead of Google.
					</PageShellDescription>
				</PageShellHeading>

				<PageShellActions>
					<HydrateClient>
						<AddSsoProviderSheet />
					</HydrateClient>
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<HydrateClient>
					<SsoTable />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
