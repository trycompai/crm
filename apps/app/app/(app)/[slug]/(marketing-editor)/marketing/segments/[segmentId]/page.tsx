import { Spinner } from "@crm/ui/components/spinner";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SegmentBuilder } from "./segment-builder";

export const metadata: Metadata = { title: "Segment" };

function Loading() {
	return (
		<div className="flex min-h-0 flex-1 items-center justify-center">
			<Spinner />
		</div>
	);
}

export default function SegmentPage({
	params,
}: PageProps<"/[slug]/marketing/segments/[segmentId]">) {
	return (
		<Suspense fallback={<Loading />}>
			<Builder params={params} />
		</Suspense>
	);
}

async function Builder({
	params,
}: Pick<PageProps<"/[slug]/marketing/segments/[segmentId]">, "params">) {
	const { segmentId } = await params;

	return <SegmentBuilder segmentId={segmentId} />;
}
