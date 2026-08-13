import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateTemplateButton } from "@/components/marketing/create-buttons";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { TemplatesTable } from "./templates-table";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Templates</PageShellTitle>
					<PageShellDescription>
						The shell every email wears, and the copy it starts from.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateTemplateButton />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Templates />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Templates() {
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(
		trpc.marketingTemplates.list.queryOptions({
			q: "",
			sort: "updatedAt",
			dir: "desc",
			page: 1,
			pageSize: 25,
		}),
	);

	return (
		<HydrateClient>
			<TemplatesTable />
		</HydrateClient>
	);
}
