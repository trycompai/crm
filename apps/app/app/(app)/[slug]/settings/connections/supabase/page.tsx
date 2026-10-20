import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPageLoading } from "../connection-page";
import { McpConnection } from "../mcp-connection";

export const metadata: Metadata = { title: "Supabase connection" };

export default function SupabaseConnectionPage(
	props: PageProps<"/[slug]/settings/connections/supabase">,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<SupabaseConnectionPageContent {...props} />
		</Suspense>
	);
}

async function SupabaseConnectionPageContent({
	params,
}: PageProps<"/[slug]/settings/connections/supabase">) {
	await requireSession();
	const { slug } = await params;
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	const [data, inventory] = await Promise.all([
		queryClient.fetchQuery(trpc.mcp.list.queryOptions()),
		queryClient.fetchQuery(
			trpc.mcp.tools.queryOptions({ platformSlug: "supabase" }),
		),
	]);
	const entry = data.entries.find((candidate) => candidate.slug === "supabase");

	if (!entry) return null;

	return (
		<McpConnection
			slug={slug}
			entry={entry}
			configured={data.configured}
			canManage={data.canManage}
			tools={inventory.tools}
		/>
	);
}
