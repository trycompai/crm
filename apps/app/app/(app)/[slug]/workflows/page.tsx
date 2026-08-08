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
import { CreateWorkflowSheet } from "./create-workflow-sheet";
import { WorkflowsList } from "./workflows-list";

export const metadata: Metadata = { title: "Workflows" };

export default function WorkflowsPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Workflows</PageShellTitle>
					<PageShellDescription>
						Automate the boring parts. Trigger on a form submit, a new deal, or
						an inbound SMS — then send messages, tag records, or fire an agent.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateWorkflowSheet />
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
		trpc.workflows.list.queryOptions({
			q: "",
			status: "all",
			trigger: "all",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 50,
		}),
	);
	return (
		<HydrateClient>
			<WorkflowsList />
		</HydrateClient>
	);
}
