import { auth, OAUTH_SCOPES } from "@crm/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { consentSearchParams, serializeOAuthQuery } from "@/lib/oauth-query";
import { getSession } from "@/lib/session";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = {
	title: "Authorize application",
};

export const instant = false;

type OAuthConsentPageProps = {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PERMISSIONS = {
	openid: "Confirm your identity",
	profile: "Read your profile",
	email: "Read your email address",
	offline_access: "Keep access after you close the application",
	"crm.read": "Read CRM records",
	"crm.write": "Create and change CRM records",
} as const satisfies Record<string, string>;

const oauthScope = z.enum(OAUTH_SCOPES);

export default async function OAuthConsentPage({
	searchParams,
}: OAuthConsentPageProps) {
	const parsedParams = consentSearchParams.safeParse(await searchParams);
	if (!parsedParams.success) redirect("/sign-in");
	const params = parsedParams.data;
	const oauthQuery = serializeOAuthQuery(params);

	const session = await getSession();
	if (!session) redirect(`/sign-in?${oauthQuery}`);

	const client = await auth.api.getOAuthClientPublic({
		query: { client_id: params.client_id },
		headers: await headers(),
	});
	const scopes = (params.scope ?? "").split(/\s+/).filter(Boolean);

	return (
		<AuthShell>
			<AuthHeading
				title={`Authorize ${client.client_name ?? client.client_id}`}
				description={`Signed in as ${session.user.email}`}
			/>
			<div className="space-y-4">
				<p className="text-muted-foreground text-sm">
					This application requests these permissions:
				</p>
				<ul className="list-disc space-y-2 pl-5 text-sm">
					{scopes.map((scope) => (
						<li key={scope}>{permissionLabel(scope)}</li>
					))}
				</ul>
				<ConsentForm oauthQuery={oauthQuery} />
			</div>
		</AuthShell>
	);
}
function permissionLabel(scope: string): string {
	const parsed = oauthScope.safeParse(scope);
	return parsed.success ? PERMISSIONS[parsed.data] : scope;
}
