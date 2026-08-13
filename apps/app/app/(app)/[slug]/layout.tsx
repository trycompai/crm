import { notFound, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppHeader, AppHeaderFallback } from "@/components/app-header";
import { AppIconRail, AppIconRailFallback } from "@/components/app-icon-rail";
import { QuickSwitcher } from "@/components/crm/quick-switcher";
import { RecordSheetHost } from "@/components/crm/record-sheet/record-sheet-host";
import { MobileNavProvider } from "@/components/mobile-nav";
import { requireMailboxAccess } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export default function AppLayout({
	children,
	params,
}: LayoutProps<"/[slug]">) {
	return (
		<MobileNavProvider>
			<div className="isolate flex h-svh flex-col">
				<Suspense fallback={<AppHeaderFallback />}>
					<WorkspaceHeader params={params} />
				</Suspense>

				<div className="flex min-h-0 flex-1">
					<Suspense fallback={<AppIconRailFallback />}>
						<PrimaryRail />
					</Suspense>
					{children}
				</div>

				<Suspense fallback={null}>
					<RecordSheetHost />
				</Suspense>

				<Suspense fallback={null}>
					<QuickSwitcher />
				</Suspense>
			</div>
		</MobileNavProvider>
	);
}

async function PrimaryRail() {
	await connection();

	const onboarded = await getServerQueryClient()
		.fetchQuery(getServerTrpc().marketing.status.queryOptions())
		.then((status) => status.onboarded)
		.catch((error: unknown) => {
			unstable_rethrow(error);
			return true;
		});

	return <AppIconRail marketingOnboarded={onboarded} />;
}

async function WorkspaceHeader({
	params,
}: Pick<LayoutProps<"/[slug]">, "params">) {
	await connection();
	const workspacePromise = getServerQueryClient()
		.fetchQuery(getServerTrpc().workspace.get.queryOptions())
		.catch((error: unknown) => {
			unstable_rethrow(error);
			return null;
		});
	const [{ user }, { slug }, workspace] = await Promise.all([
		requireMailboxAccess(),
		params,
		workspacePromise,
	]);

	if (workspace && workspace.slug !== slug) notFound();

	return (
		<HydrateClient>
			<AppHeader
				user={{
					name: user.name,
					email: user.email,
					image: user.image ?? null,
				}}
			/>
		</HydrateClient>
	);
}
