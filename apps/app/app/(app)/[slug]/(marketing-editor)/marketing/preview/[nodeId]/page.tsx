import { Spinner } from "@crm/ui/components/spinner";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { EmailPreview } from "./email-preview";

export const metadata: Metadata = { title: "Email preview" };

function Loading() {
	return (
		<div className="flex min-h-0 flex-1 items-center justify-center">
			<Spinner />
		</div>
	);
}

export default function PreviewPage({
	params,
}: PageProps<"/[slug]/marketing/preview/[nodeId]">) {
	return (
		<Suspense fallback={<Loading />}>
			<Preview params={params} />
		</Suspense>
	);
}

async function Preview({
	params,
}: Pick<PageProps<"/[slug]/marketing/preview/[nodeId]">, "params">) {
	const { nodeId } = await params;

	const rendered = await getServerQueryClient().fetchQuery(
		getServerTrpc().marketingCampaigns.previewNode.queryOptions({ nodeId }),
	);

	return (
		<EmailPreview
			html={rendered.html ?? ""}
			text={rendered.text ?? ""}
			subject={rendered.subject ?? ""}
			blocked={rendered.blocked ?? null}
		/>
	);
}
