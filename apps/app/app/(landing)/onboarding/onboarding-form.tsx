"use client";

import { workspaceSlug } from "@crm/db/workspace";
import { AuthButton } from "@crm/ui/components/auth-button";
import {
	AuthField,
	AuthFieldDescription,
	AuthFieldGroup,
	AuthFieldLabel,
} from "@crm/ui/components/auth-field";
import { AuthInput } from "@crm/ui/components/auth-input";
import {
	AuthInputGroup,
	AuthInputGroupAddon,
	AuthInputGroupInput,
	AuthInputGroupText,
} from "@crm/ui/components/auth-input-group";
import { LogoSpinner } from "@crm/ui/components/logo-spinner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function OnboardingForm({ placeholder }: { placeholder: string }) {
	const trpc = useTRPC();
	const router = useRouter();

	const nameId = useId();
	const slugId = useId();
	const websiteId = useId();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const slugEdited = useRef(false);

	const save = useMutation(
		trpc.workspace.update.mutationOptions({
			onSuccess: () => {
				router.refresh();
				router.replace("/onboarding/research");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();

				const form = new FormData(event.currentTarget);

				save.mutate({
					name: String(form.get("name") ?? "").trim(),
					slug: workspaceSlug(String(form.get("slug") ?? "")),
					website: String(form.get("website") ?? "").trim(),
				});
			}}
			className="flex flex-col gap-6"
		>
			<AuthFieldGroup>
				<AuthField>
					<AuthFieldLabel htmlFor={nameId}>Company name</AuthFieldLabel>
					<AuthInput
						id={nameId}
						name="name"
						value={name}
						onChange={(event) => {
							const next = event.target.value;
							setName(next);
							if (!slugEdited.current) setSlug(workspaceSlug(next));
						}}
						placeholder={placeholder}
						autoComplete="organization"
						autoFocus
						required
					/>
				</AuthField>

				<AuthField>
					<AuthFieldLabel htmlFor={slugId}>Workspace URL</AuthFieldLabel>
					<AuthInputGroup>
						<AuthInputGroupAddon>
							<AuthInputGroupText>/</AuthInputGroupText>
						</AuthInputGroupAddon>
						<AuthInputGroupInput
							id={slugId}
							name="slug"
							value={slug}
							onChange={(event) => {
								slugEdited.current = true;
								setSlug(workspaceSlugDraft(event.target.value));
							}}
							onBlur={() =>
								setSlug((value) => (value ? workspaceSlug(value) : ""))
							}
							placeholder={workspaceSlug(placeholder)}
							autoComplete="off"
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
							required
						/>
					</AuthInputGroup>
					<AuthFieldDescription>
						Your team will use this address to open the CRM.
					</AuthFieldDescription>
				</AuthField>

				<AuthField>
					<AuthFieldLabel htmlFor={websiteId}>Website</AuthFieldLabel>
					<AuthInputGroup>
						<AuthInputGroupAddon>
							<AuthInputGroupText>https://</AuthInputGroupText>
						</AuthInputGroupAddon>
						<AuthInputGroupInput
							id={websiteId}
							name="website"
							placeholder="acme.com"
							autoComplete="off"
							autoCapitalize="off"
							autoCorrect="off"
							spellCheck={false}
							inputMode="url"
							required
						/>
					</AuthInputGroup>
					<AuthFieldDescription>
						Read once, so every answer afterwards knows what you sell.
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

function workspaceSlugDraft(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+/, "");
}
