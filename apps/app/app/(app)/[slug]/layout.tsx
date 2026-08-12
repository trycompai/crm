import { notFound, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppHeader, AppHeaderFallback } from "@/components/app-header";
import { AppIconRail, AppIconRailFallback } from "@/components/app-icon-rail";
import { QuickSwitcher } from "@/components/crm/quick-switcher";
import { RecordSheetHost } from "@/components/crm/record-sheet/record-sheet-host";
import { MobileNavProvider } from "@/components/mobile-nav";
import { ViewerDayProvider } from "@/components/viewer-day";
import { requireMailboxAccess } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

const PRERENDER_DAY = "1970-01-01";

export default function AppLayout({
	children,
	params,
}: LayoutProps<"/[slug]">) {
	return (
		<ViewerDayProvider initialDay={PRERENDER_DAY}>
			<MobileNavProvider>
				<div className="isolate flex h-svh flex-col">
					<Suspense fallback={<AppHeaderFallback />}>
						<WorkspaceHeader params={params} />
					</Suspense>

					<div className="flex min-h-0 flex-1">
						<Suspense fallback={<AppIconRailFallback />}>
							<AppIconRail />
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
		</ViewerDayProvider>
	);
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
