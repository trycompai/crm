import { providerBrand } from "@crm/ui/lib/provider-brand";
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPageLoading } from "../connection-page";
import { McpConnection } from "../mcp-connection";
import { presentMcpConnection } from "../mcp-connection-presentation";
import { presentSupabaseToolDescription } from "./supabase-tool-description";

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
	const tools = await Promise.all(
		inventory.tools.map(async (tool) => ({
			...tool,
			presentation: await presentSupabaseToolDescription(tool.description),
		})),
	);
	const presentation = presentMcpConnection({
		platformSlug: "supabase",
		connection: entry.connection,
		agents: entry.agents,
		tools,
	});

	return (
		<McpConnection
			slug={slug}
			entry={entry}
			brand={providerBrand("supabase", "Supabase")}
			configured={data.configured}
			canManage={data.canManage}
			presentation={presentation}
		/>
	);
}
