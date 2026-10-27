import { notFound, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountMenu, AccountMenuFallback } from "@/components/account-menu";
import { QuickSwitcher } from "@/components/crm/quick-switcher";
import { RecordSheetHost } from "@/components/crm/record-sheet/record-sheet-host";
import { RecordStackBoundary } from "@/components/crm/record-sheet/record-stack";
import { EnrichmentQueue } from "@/components/enrichment-queue";
import { MobileNavProvider } from "@/components/mobile-nav";
import { WorkspaceNav, WorkspaceNavFallback } from "@/components/workspace-nav";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireMailboxAccess } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export default function AppLayout({
	children,
	params,
}: LayoutProps<"/[slug]">) {
	return (
		<MobileNavProvider>
			<RecordStackBoundary>
				<WorkspaceShell
					sidebar={
						<Suspense fallback={<WorkspaceNavFallback />}>
							<WorkspaceSidebar />
						</Suspense>
					}
					end={
						<Suspense fallback={<AccountMenuFallback />}>
							<WorkspaceAccount params={params} />
						</Suspense>
					}
				>
					{children}
				</WorkspaceShell>

				<Suspense fallback={null}>
					<RecordSheetHost />
				</Suspense>

				<Suspense fallback={null}>
					<QuickSwitcher />
				</Suspense>
			</RecordStackBoundary>
		</MobileNavProvider>
	);
}

async function loadWorkspace() {
	try {
		return await getServerQueryClient().fetchQuery(
			getServerTrpc().workspace.get.queryOptions(),
		);
	} catch (error) {
		unstable_rethrow(error);
		return null;
	}
}

async function WorkspaceSidebar() {
	await connection();
	const workspace = await loadWorkspace();

	return <WorkspaceNav initialWorkspace={workspace ?? undefined} />;
}

async function WorkspaceAccount({
	params,
}: Pick<LayoutProps<"/[slug]">, "params">) {
	await connection();
	const [{ user }, { slug }, workspace] = await Promise.all([
		requireMailboxAccess(),
		params,
		loadWorkspace(),
	]);

	if (workspace && workspace.slug !== slug) notFound();

	return (
		<HydrateClient>
			<EnrichmentQueue />
			<AccountMenu
				user={{
					name: user.name,
					email: user.email,
					image: user.image ?? null,
				}}
			/>
		</HydrateClient>
	);
}
