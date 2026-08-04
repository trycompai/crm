"use client";

import { signIn } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";

export type SsoProvider = {
	providerId: string;
	name: string;
};

export function SsoSignIn({ providers }: { providers: SsoProvider[] }) {
	const [pending, setPending] = useState<string | null>(null);

	async function handleClick(providerId: string) {
		setPending(providerId);

		const origin = window.location.origin;

		const { error } = await signIn.sso({
			providerId,
			callbackURL: `${origin}/`,
			errorCallbackURL: `${origin}/sign-in`,
		});

		if (error) {
			toast.error(error.message ?? "Could not reach the sign-in service.");
			setPending(null);
		}
	}

	return (
		<>
			{providers.map((provider) => (
				<Button
					key={provider.providerId}
					className="w-full"
					disabled={pending !== null}
					onClick={() => handleClick(provider.providerId)}
					type="button"
					variant="outline"
				>
					{pending === provider.providerId ? (
						<Spinner data-icon="inline-start" />
					) : null}
					Continue with {provider.name}
				</Button>
			))}
		</>
	);
}
