import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPageLoading } from "../connection-page";
import { McpConnection } from "../mcp-connection";

export const metadata: Metadata = { title: "Linear connection" };

export default function LinearConnectionPage(
	props: PageProps<"/[slug]/settings/connections/linear">,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<LinearConnectionPageContent {...props} />
		</Suspense>
	);
}

async function LinearConnectionPageContent({
	params,
}: PageProps<"/[slug]/settings/connections/linear">) {
	await requireSession();
	const { slug } = await params;
	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	const [data, inventory] = await Promise.all([
		queryClient.fetchQuery(trpc.mcp.list.queryOptions()),
		queryClient.fetchQuery(
			trpc.mcp.tools.queryOptions({ platformSlug: "linear" }),
		),
	]);
	const entry = data.entries.find((candidate) => candidate.slug === "linear");

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
