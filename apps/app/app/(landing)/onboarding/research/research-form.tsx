"use client";

import { CONTEXT_DEV_SIGNUP_URL } from "@crm/db/settings";
import { AuthButton } from "@crm/ui/components/auth-button";
import {
	AuthField,
	AuthFieldDescription,
	AuthFieldGroup,
	AuthFieldLabel,
} from "@crm/ui/components/auth-field";
import { AuthInput } from "@crm/ui/components/auth-input";
import { LogoSpinner } from "@crm/ui/components/logo-spinner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function ResearchForm() {
	const trpc = useTRPC();
	const router = useRouter();

	const keyId = useId();

	const save = useMutation(
		trpc.settings.setResearchKey.mutationOptions({
			onSuccess: () => {
				router.refresh();
				router.replace("/");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				save.mutate({ apiKey: String(form.get("apiKey") ?? "").trim() });
			}}
			className="flex flex-col gap-6"
		>
			<AuthFieldGroup>
				<AuthField>
					<AuthFieldLabel htmlFor={keyId}>Context API key</AuthFieldLabel>
					<AuthInput
						id={keyId}
						name="apiKey"
						type="password"
						placeholder="Paste the key"
						autoComplete="off"
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						autoFocus
						required
					/>
					<AuthFieldDescription>
						Don't have a Context API key?{" "}
						<a
							href={CONTEXT_DEV_SIGNUP_URL}
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-4 hover:text-foreground"
						>
							Sign up here
						</a>
					</AuthFieldDescription>
				</AuthField>
			</AuthFieldGroup>

			<AuthButton type="submit" disabled={save.isPending}>
				{save.isPending ? <LogoSpinner data-icon="inline-start" /> : null}
				Continue
			</AuthButton>
		</form>
	);
}
