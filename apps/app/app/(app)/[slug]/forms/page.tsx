import type { Metadata } from "next";
import { Suspense } from "react";
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
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { CreateFormSheet } from "./create-form-sheet";
import { FormsList } from "./forms-list";

export const metadata: Metadata = { title: "Forms" };

export default function FormsPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Forms</PageShellTitle>
					<PageShellDescription>
						Capture leads from anywhere on the web. Each form drops rows into
						contacts, tags them, and can kick off a workflow.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateFormSheet />
				</PageShellActions>
			</PageShellHeader>
			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Load />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Load() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		trpc.forms.list.queryOptions({
			q: "",
			status: "all",
			clientAccountId: "all",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 50,
		}),
	);
	return (
		<HydrateClient>
			<FormsList />
		</HydrateClient>
	);
}
