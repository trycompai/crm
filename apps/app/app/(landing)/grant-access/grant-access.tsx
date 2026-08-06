"use client";

import { authClient, signOut } from "@crm/auth/client";
import { SYNC_SCOPES } from "@crm/auth/scopes";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";

async function signOutAndRedirect() {
	const { error } = await signOut();

	if (error) {
		toast.error(error.message ?? "Could not sign out.");
		return;
	}

	window.location.assign("/sign-in");
}

export function GrantAccess() {
	const [pending, setPending] = useState(false);

	async function handleGrant() {
		setPending(true);
		try {
			const origin = window.location.origin;
			const { error } = await authClient.linkSocial({
				provider: "google",
				scopes: [...SYNC_SCOPES],
				callbackURL: `${origin}/`,
				errorCallbackURL: `${origin}/grant-access`,
			});

			if (error) toast.error(error.message ?? "Could not reach Google.");
		} catch {
			toast.error("Could not reach Google.");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<Button
				className="w-full"
				disabled={pending}
				onClick={handleGrant}
				type="button"
			>
				{pending ? (
					<Spinner data-icon="inline-start" />
				) : (
					<GoogleLogo data-icon="inline-start" className="size-4" />
				)}
				Grant access
			</Button>

			<Button
				className="w-full"
				onClick={() => {
					signOutAndRedirect().catch(() => toast.error("Could not sign out."));
				}}
				type="button"
				variant="ghost"
			>
				Sign out
			</Button>
		</div>
	);
}
