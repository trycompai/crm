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
import { contactsSearchParams } from "./contacts-search-params";
import { ContactsTable } from "./contacts-table";
import { CreateContactSheet } from "./create-contact-sheet";

export const metadata: Metadata = {
	title: "Contacts",
};

export default function ContactsPage({
	searchParams,
}: PageProps<"/[slug]/contacts">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Contacts</PageShellTitle>
					<PageShellDescription>Everyone in the pipeline.</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateContactSheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Contacts searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Contacts({
	searchParams,
}: Pick<PageProps<"/[slug]/contacts">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		contactsSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(
			trpc.contacts.list.queryOptions(contactsSearchParams.toInput(values)),
		),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
		queryClient.prefetchQuery(trpc.companies.options.queryOptions({ q: "" })),
	]);

	return (
		<HydrateClient>
			<ContactsTable />
		</HydrateClient>
	);
}
