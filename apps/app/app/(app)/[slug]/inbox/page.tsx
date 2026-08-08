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
import { InboxUI } from "./inbox-ui";

export const metadata: Metadata = {
	title: "Inbox",
};

export default function InboxPage() {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Inbox</PageShellTitle>
					<PageShellDescription>
						Every conversation — SMS, email, calls — in one place.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent className="min-h-0 p-0">
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
		trpc.sms.list.queryOptions({
			q: "",
			unread: "all",
			clientAccountId: "all",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 50,
		}),
	);
	return (
		<HydrateClient>
			<InboxUI />
		</HydrateClient>
	);
}
