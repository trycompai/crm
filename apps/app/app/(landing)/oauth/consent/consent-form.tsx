"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";

export type ConsentFormProps = {
	oauthQuery: string;
};

export function ConsentForm({ oauthQuery }: ConsentFormProps) {
	const [pending, setPending] = useState<"approve" | "deny" | null>(null);

	async function decide(accept: boolean) {
		setPending(accept ? "approve" : "deny");
		const { data, error } = await authClient.oauth2.consent({
			accept,
			oauth_query: oauthQuery,
		});
		if (error || !data || !("url" in data)) {
			toast.error(error?.message ?? "Could not complete authorization.");
			setPending(null);
			return;
		}
		window.location.assign(data.url);
	}

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<Button
				disabled={pending !== null}
				onClick={() => void decide(false)}
				type="button"
				variant="outline"
			>
				{pending === "deny" ? <Spinner data-icon="inline-start" /> : null}
				Deny
			</Button>
			<Button
				disabled={pending !== null}
				onClick={() => void decide(true)}
				type="button"
			>
				{pending === "approve" ? <Spinner data-icon="inline-start" /> : null}
				Approve
			</Button>
		</div>
	);
}
