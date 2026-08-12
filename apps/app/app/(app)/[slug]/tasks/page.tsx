import { toDay } from "@crm/ui/lib/format";
import type { Metadata } from "next";
import { connection } from "next/server";
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
import { ViewerDayProvider } from "@/components/viewer-day";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { tasksSearchParams } from "./tasks-search-params";
import { TasksTable } from "./tasks-table";

export const metadata: Metadata = {
	title: "Tasks",
};

export default function TasksPage({
	searchParams,
}: PageProps<"/[slug]/tasks">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Tasks</PageShellTitle>
					<PageShellDescription>
						Everything logged against a company, a contact or a deal.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Tasks searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Tasks({
	searchParams,
}: Pick<PageProps<"/[slug]/tasks">, "searchParams">) {
	await connection();
	const [, values] = await Promise.all([
		requireSession(),
		tasksSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const today = toDay(new Date());
	await Promise.all([
		queryClient.prefetchQuery(
			trpc.activities.tasks.queryOptions({
				...tasksSearchParams.toInput(values),
				today,
			}),
		),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
	]);

	return (
		<HydrateClient>
			<ViewerDayProvider initialDay={today}>
				<TasksTable />
			</ViewerDayProvider>
		</HydrateClient>
	);
}
