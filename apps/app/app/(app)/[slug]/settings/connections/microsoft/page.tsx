import { Spinner } from "@crm/ui/components/spinner";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectionPage } from "../connection-page";
import { MicrosoftConnection } from "../microsoft-connection";

export const metadata: Metadata = { title: "Microsoft 365" };

type MicrosoftConnectionPageProps = {
	params: Promise<{ slug: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function MicrosoftConnectionPage(
	props: MicrosoftConnectionPageProps,
) {
	return (
		<Suspense
			fallback={
				<ConnectionPage centered>
					<Spinner size="lg" />
				</ConnectionPage>
			}
		>
			<MicrosoftConnectionPageContent {...props} />
		</Suspense>
	);
}

async function MicrosoftConnectionPageContent({
	params,
	searchParams,
}: MicrosoftConnectionPageProps) {
	const [{ slug }, query] = await Promise.all([params, searchParams]);
	return (
		<ConnectionPage>
			<MicrosoftConnection
				slug={slug}
				connectError={
					first(query.provider) === "microsoft" ? first(query.error) : undefined
				}
			/>
		</ConnectionPage>
	);
}

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}
