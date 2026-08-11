import { Suspense } from "react";
import { ConnectionPage, ConnectionPageLoading } from "./connection-page";

export type ConnectionQuery = Record<string, string | string[] | undefined>;

type OAuthConnectionPageProps = {
	connection: React.ComponentType<{ slug: string; connectError?: string }>;
	params: Promise<{ slug: string }>;
	provider: string;
	searchParams: Promise<ConnectionQuery>;
};

export function OAuthConnectionPage(props: OAuthConnectionPageProps) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<OAuthConnectionPageContent {...props} />
		</Suspense>
	);
}

export function connectErrorOf(query: ConnectionQuery, provider: string) {
	return first(query.provider) === provider ? first(query.error) : undefined;
}

async function OAuthConnectionPageContent({
	connection: Connection,
	params,
	provider,
	searchParams,
}: OAuthConnectionPageProps) {
	const [{ slug }, query] = await Promise.all([params, searchParams]);

	return (
		<ConnectionPage>
			<Connection connectError={connectErrorOf(query, provider)} slug={slug} />
		</ConnectionPage>
	);
}

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}
