"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

const CONNECT_ERRORS = new Map([
	[
		"access_denied",
		"The HubSpot install was cancelled before access was granted.",
	],
	[
		"account_already_linked_to_different_user",
		"That HubSpot user is already linked to another CRM account.",
	],
	[
		"email_doesn't_match",
		"The HubSpot user's email must match the CRM account you are signed in with. Sign in to HubSpot as that person, or connect from the CRM account that matches.",
	],
	[
		"oauth_code_verification_failed",
		"HubSpot rejected the app credentials or redirect URL. Check the client ID, client secret, and the redirect URL on the app, then try again.",
	],
	[
		"user_info_is_missing",
		"HubSpot did not say which account the install was for. Confirm the app requests the oauth scope, then try again.",
	],
]);

async function startHubspotOAuth(slug: string) {
	try {
		const { error } = await authClient.oauth2.link({
			providerId: "hubspot",
			callbackURL: `${window.location.origin}/${slug}/settings/connections/hubspot`,
			errorCallbackURL: `${window.location.origin}/${slug}/settings/connections/hubspot?provider=hubspot`,
		});
		if (error) toast.error(error.message || "Could not connect HubSpot.");
	} catch (error) {
		toast.error(
			error instanceof Error ? error.message : "Could not connect HubSpot.",
		);
	}
}

export function HubspotReconnectButton({ slug }: { slug: string }) {
	const [pending, setPending] = useState(false);

	return (
		<Button
			disabled={pending}
			onClick={async () => {
				setPending(true);
				await startHubspotOAuth(slug);
				setPending(false);
			}}
			size="xs"
			variant="contrast"
		>
			{pending ? "Opening HubSpot…" : "Reconnect"}
		</Button>
	);
}

export function HubspotConnectButton({
	slug,
	configured,
	connectError,
}: {
	slug: string;
	configured: boolean;
	connectError?: string;
}) {
	const [pending, setPending] = useState(false);
	const connect = async () => {
		setPending(true);
		await startHubspotOAuth(slug);
		setPending(false);
	};

	return (
		<div className="flex min-w-0 flex-col gap-2">
			<Button onClick={() => void connect()} disabled={!configured || pending}>
				{pending
					? "Opening HubSpot…"
					: configured
						? "Connect HubSpot"
						: "HubSpot is not configured"}
			</Button>
			{connectError ? (
				<p role="alert" className="max-w-sm text-destructive text-xs">
					{CONNECT_ERRORS.get(connectError) ??
						`HubSpot could not be connected (${connectError.replaceAll("_", " ")}).`}
				</p>
			) : null}
		</div>
	);
}
