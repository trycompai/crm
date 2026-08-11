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
import { AgendaView } from "./agenda-view";

export const metadata: Metadata = { title: "Revenue calendar" };

export default function CalendarPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Revenue calendar</PageShellTitle>
					<PageShellDescription>
						One operating view for calls, follow-ups, approved outreach and deal
						targets.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<CalendarData />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function CalendarData() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(trpc.calendar.agenda.queryOptions());
	return (
		<HydrateClient>
			<AgendaView />
		</HydrateClient>
	);
}
