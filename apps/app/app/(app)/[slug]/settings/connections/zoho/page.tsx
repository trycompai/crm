import type { Metadata } from "next";
import {
	type ConnectionQuery,
	OAuthConnectionPage,
} from "../oauth-connection-page";
import { ZohoConnection } from "../zoho-connection";

export const metadata: Metadata = { title: "Zoho Mail" };

export default function ZohoConnectionPage(props: {
	params: Promise<{ slug: string }>;
	searchParams: Promise<ConnectionQuery>;
}) {
	return (
		<OAuthConnectionPage
			{...props}
			connection={ZohoConnection}
			provider="zoho"
		/>
	);
}
