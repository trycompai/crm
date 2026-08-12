"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

const CONNECT_ERRORS: Record<string, string> = {
	access_denied: "Slack installation was cancelled before access was granted.",
	account_already_linked_to_different_user:
		"That Slack installer is already linked to another CRM account.",
	"email_doesn't_match":
		"The Slack installer's email must match the CRM account you are signed in with.",
	oauth_code_verification_failed:
		"Slack rejected the app credentials or redirect URL. Check the client ID, client secret, and OAuth redirect URL, then try again.",
	user_info_is_missing:
		"Slack did not return the installer's profile. Confirm the app has users:read and users:read.email, reinstall it, then try again.",
};

async function startSlackOAuth(slug: string) {
	try {
		const { error } = await authClient.oauth2.link({
			providerId: "slack",
			callbackURL: `${window.location.origin}/${slug}/settings/connections/slack/people`,
			errorCallbackURL: `${window.location.origin}/${slug}/settings/connections/slack?provider=slack`,
		});
		if (error) toast.error(error.message || "Could not connect Slack.");
	} catch (error) {
		toast.error(
			error instanceof Error ? error.message : "Could not connect Slack.",
		);
	}
}

export function SlackReconnectButton({ slug }: { slug: string }) {
	const [pending, setPending] = useState(false);

	return (
		<Button
			disabled={pending}
			onClick={async () => {
				setPending(true);
				await startSlackOAuth(slug);
				setPending(false);
			}}
			size="xs"
			variant="contrast"
		>
			{pending ? "Opening Slack…" : "Reconnect"}
		</Button>
	);
}

export function SlackConnectButton({
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
		await startSlackOAuth(slug);
		setPending(false);
	};
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<Button onClick={() => void connect()} disabled={!configured || pending}>
				{pending
					? "Opening Slack…"
					: configured
						? "Connect Slack"
						: "Slack is not configured"}
			</Button>
			{connectError ? (
				<p role="alert" className="max-w-sm text-destructive text-xs">
					{CONNECT_ERRORS[connectError] ??
						`Slack could not be connected (${connectError.replaceAll("_", " ")}).`}
				</p>
			) : null}
		</div>
	);
}
