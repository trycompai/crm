import { Spinner } from "@crm/ui/components/spinner";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectionPage } from "../connection-page";
import { GoogleConnection } from "../google-connection";

export const metadata: Metadata = { title: "Google Workspace" };

type GoogleConnectionPageProps = {
	params: Promise<{ slug: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function GoogleConnectionPage(props: GoogleConnectionPageProps) {
	return (
		<Suspense
			fallback={
				<ConnectionPage centered>
					<Spinner size="lg" />
				</ConnectionPage>
			}
		>
			<GoogleConnectionPageContent {...props} />
		</Suspense>
	);
}

async function GoogleConnectionPageContent({
	params,
	searchParams,
}: GoogleConnectionPageProps) {
	const [{ slug }, query] = await Promise.all([params, searchParams]);
	return (
		<ConnectionPage>
			<GoogleConnection
				slug={slug}
				connectError={
					first(query.provider) === "google" ? first(query.error) : undefined
				}
			/>
		</ConnectionPage>
	);
}

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}
