import { Spinner } from "@crm/ui/components/spinner";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignCanvas } from "./campaign-canvas";

export const metadata: Metadata = { title: "Campaign" };

function Loading() {
	return (
		<div className="flex min-h-0 flex-1 items-center justify-center">
			<Spinner />
		</div>
	);
}

export default function CampaignPage({
	params,
}: PageProps<"/[slug]/marketing/campaigns/[campaignId]">) {
	return (
		<Suspense fallback={<Loading />}>
			<Canvas params={params} />
		</Suspense>
	);
}

async function Canvas({
	params,
}: Pick<PageProps<"/[slug]/marketing/campaigns/[campaignId]">, "params">) {
	const { campaignId } = await params;

	return <CampaignCanvas campaignId={campaignId} />;
}
