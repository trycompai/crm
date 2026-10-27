"use client";

import { signIn } from "@crm/auth/client";
import { AuthButton } from "@crm/ui/components/auth-button";
import { LogoSpinner } from "@crm/ui/components/logo-spinner";
import { useState } from "react";
import { toast } from "sonner";

export type SsoProvider = {
	providerId: string;
	name: string;
};

export function SsoSignIn({ providers }: { providers: SsoProvider[] }) {
	const [pending, setPending] = useState<string | null>(null);

	function fail(message?: string) {
		setPending(null);
		toast.error(message ?? "Could not reach the sign-in service.");
	}

	async function handleClick(providerId: string) {
		setPending(providerId);

		const origin = window.location.origin;

		const { error } = await signIn.sso({
			providerId,
			callbackURL: `${origin}/`,
			errorCallbackURL: `${origin}/sign-in`,
		});

		if (error) fail(error.message);
	}

	return (
		<>
			{providers.map((provider) => (
				<AuthButton
					key={provider.providerId}
					className="w-full"
					disabled={pending !== null}
					onClick={() => {
						handleClick(provider.providerId).catch(() => fail());
					}}
					type="button"
					variant="outline"
				>
					{pending === provider.providerId ? (
						<LogoSpinner data-icon="inline-start" />
					) : null}
					Continue with {provider.name}
				</AuthButton>
			))}
		</>
	);
}
