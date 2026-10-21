"use client";

import type { MailboxProviderId } from "@crm/auth/scopes";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import ZohoLogo from "@crm/ui/components/brand-logos/zoho";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import type { FC, SVGProps } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { startMailboxGrant } from "@/lib/mailbox-oauth";
import { signOutAndRedirect } from "@/lib/sign-out";

type ProviderGrant = {
	label: string;
	Logo: FC<SVGProps<SVGSVGElement>>;
};

const PROVIDERS = {
	google: { label: "Grant Google access", Logo: GoogleLogo },
	microsoft: { label: "Grant Microsoft access", Logo: MicrosoftLogo },
	zoho: { label: "Grant Zoho Mail access", Logo: ZohoLogo },
} as const satisfies Record<MailboxProviderId, ProviderGrant>;

export function GrantAccess({
	providers,
}: {
	providers: readonly MailboxProviderId[];
}) {
	const [pending, setPending] = useState<MailboxProviderId | null>(null);

	function fail(message?: string) {
		setPending(null);
		toast.error(message ?? "Could not reach the provider.");
	}

	async function handleGrant(provider: MailboxProviderId) {
		setPending(provider);

		const origin = window.location.origin;

		const { error } = await startMailboxGrant(provider, {
			callbackURL: `${origin}/`,
			errorCallbackURL: `${origin}/grant-access`,
		});

		if (error) fail(error.message);
	}

	const single = providers.length === 1;

	return (
		<div className="flex flex-col gap-3">
			{providers.map((provider) => {
				const { label, Logo } = PROVIDERS[provider];

				return (
					<Button
						key={provider}
						className="w-full"
						disabled={pending !== null}
						onClick={() => {
							handleGrant(provider).catch(() => fail());
						}}
						type="button"
					>
						{pending === provider ? (
							<Spinner data-icon="inline-start" />
						) : (
							<Logo data-icon="inline-start" className="size-4" />
						)}
						{single ? "Grant access" : label}
					</Button>
				);
			})}

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
