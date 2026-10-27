import {
	PageShell,
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
import { normalizeTasksInput, tasksSearchParams } from "./tasks-search-params";
import { TasksTable } from "./tasks-table";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage({
	searchParams,
}: PageProps<"/[slug]/tasks">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Tasks</PageShellTitle>
					<PageShellDescription>
						Work that needs a next step.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading shape="table" />}>
					<Tasks searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Tasks({
	searchParams,
}: Pick<PageProps<"/[slug]/tasks">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		tasksSearchParams.load(searchParams),
	]);
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(
			trpc.activities.tasks.queryOptions(
				normalizeTasksInput(tasksSearchParams.toInput(values)),
			),
		),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
	]);

	return (
		<HydrateClient>
			<TasksTable />
		</HydrateClient>
	);
}
