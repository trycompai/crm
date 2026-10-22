import { vendorBySlug } from "@crm/mcp-integrations/catalog";
import { providerBrand } from "@crm/ui/lib/provider-brand";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { presentCloudflareToolDescription } from "../cloudflare-tool-description";
import { ConnectionPageLoading } from "../connection-page";
import { McpConnection } from "../mcp-connection";
import { presentMcpConnection } from "../mcp-connection-presentation";

type ConnectionParams = Promise<{ slug: string; platformSlug: string }>;

export async function generateMetadata({
	params,
}: {
	params: ConnectionParams;
}): Promise<Metadata> {
	const { platformSlug } = await params;
	const vendor = vendorBySlug(platformSlug);
	return { title: vendor ? `${vendor.name} connection` : "Connection" };
}

export default function McpConnectionPage({
	params,
}: {
	params: ConnectionParams;
}) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<McpConnectionPageContent params={params} />
		</Suspense>
	);
}

async function McpConnectionPageContent({
	params,
}: {
	params: ConnectionParams;
}) {
	await requireSession();
	const { slug, platformSlug } = await params;
	const vendor = vendorBySlug(platformSlug);
	if (!vendor) notFound();

	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();
	const [data, inventory] = await Promise.all([
		queryClient.fetchQuery(trpc.mcp.list.queryOptions()),
		queryClient.fetchQuery(trpc.mcp.tools.queryOptions({ platformSlug })),
	]);
	const entry = data.entries.find(
		(candidate) => candidate.slug === platformSlug,
	);
	if (!entry) notFound();
	const tools =
		platformSlug === "cloudflare"
			? await Promise.all(
					inventory.tools.map(async (tool) => ({
						...tool,
						presentation: await presentCloudflareToolDescription(
							tool.description,
						),
					})),
				)
			: inventory.tools;
	const presentation = presentMcpConnection({
		platformSlug,
		connection: entry.connection,
		agents: entry.agents,
		tools,
	});

	return (
		<McpConnection
			slug={slug}
			entry={entry}
			brand={providerBrand(vendor.slug, vendor.name)}
			configured={data.configured}
			canManage={data.canManage}
			presentation={presentation}
		/>
	);
}
