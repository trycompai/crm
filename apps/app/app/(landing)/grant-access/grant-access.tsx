"use client";

import { authClient } from "@crm/auth/client";
import {
	type MailboxProviderId,
	MICROSOFT_SYNC_SCOPES,
	SYNC_SCOPES,
} from "@crm/auth/scopes";
import { AuthButton } from "@crm/ui/components/auth-button";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import { LogoSpinner } from "@crm/ui/components/logo-spinner";
import type { FC, SVGProps } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { signOutAndRedirect } from "@/lib/sign-out";

type ProviderGrant = {
	label: string;
	scopes: readonly string[];
	Logo: FC<SVGProps<SVGSVGElement>>;
};

const PROVIDERS = {
	google: {
		label: "Grant Google access",
		scopes: [...SYNC_SCOPES],
		Logo: GoogleLogo,
	},
	microsoft: {
		label: "Grant Microsoft access",
		scopes: [...MICROSOFT_SYNC_SCOPES],
		Logo: MicrosoftLogo,
	},
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

		const { error } = await authClient.linkSocial({
			provider,
			scopes: [...PROVIDERS[provider].scopes],
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
					<AuthButton
						key={provider}
						className="w-full"
						disabled={pending !== null}
						onClick={() => {
							handleGrant(provider).catch(() => fail());
						}}
						type="button"
					>
						{pending === provider ? (
							<LogoSpinner data-icon="inline-start" />
						) : (
							<Logo data-icon="inline-start" className="size-4" />
						)}
						{single ? "Grant access" : label}
					</AuthButton>
				);
			})}

			<AuthButton
				className="w-full"
				onClick={() => {
					signOutAndRedirect().catch(() => toast.error("Could not sign out."));
				}}
				type="button"
				variant="ghost"
			>
				Sign out
			</AuthButton>
		</div>
	);
}
