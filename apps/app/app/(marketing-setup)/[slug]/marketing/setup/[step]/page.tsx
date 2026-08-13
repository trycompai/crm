import { Spinner } from "@crm/ui/components/spinner";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { SetupWizard } from "./setup-wizard";
import { isSetupStep } from "./steps";

export const metadata: Metadata = { title: "Set up marketing" };

function Loading() {
	return (
		<div className="flex h-svh items-center justify-center">
			<Spinner />
		</div>
	);
}

export default function MarketingSetupPage({
	params,
}: PageProps<"/[slug]/marketing/setup/[step]">) {
	return (
		<Suspense fallback={<Loading />}>
			<Setup params={params} />
		</Suspense>
	);
}

async function Setup({
	params,
}: Pick<PageProps<"/[slug]/marketing/setup/[step]">, "params">) {
	const { step } = await params;

	if (!isSetupStep(step)) notFound();

	const queryClient = getServerQueryClient();
	const trpc = getServerTrpc();

	await queryClient.prefetchQuery(trpc.marketing.settings.queryOptions());

	return (
		<HydrateClient>
			<SetupWizard step={step} />
		</HydrateClient>
	);
}
