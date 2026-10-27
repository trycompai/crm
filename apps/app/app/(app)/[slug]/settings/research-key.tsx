"use client";

import { CONTEXT_DEV_SIGNUP_URL } from "@crm/db/settings";
import { Button } from "@crm/ui/components/button";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { SettingsCard } from "@crm/ui/components/settings-card";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ResearchKey() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const keyId = useId();
	const [draft, setDraft] = useState("");

	const key = useQuery(trpc.settings.researchKey.queryOptions());

	const save = useMutation(
		trpc.settings.setResearchKey.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				setDraft("");
				toast.success("Context API key saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!key.data) return null;

	const { configured, hint } = key.data;

	return (
		<SettingsCard
			title="Company research"
			description="Enter your Context API key so our agents can research every company in the CRM."
			status={
				<StatusIndicator
					size="sm"
					tone={configured ? "success" : "warning"}
					label={configured ? "Connected" : "Not connected"}
				/>
			}
			hint={
				<>
					Don't have a Context API key?{" "}
					<a href={CONTEXT_DEV_SIGNUP_URL} target="_blank" rel="noreferrer">
						Sign up here
					</a>
				</>
			}
			action={
				<Button
					type="submit"
					form="research-key"
					size="sm"
					disabled={save.isPending || draft.trim() === ""}
				>
					{save.isPending ? <Spinner data-icon="inline-start" /> : null}
					{configured ? "Replace key" : "Save key"}
				</Button>
			}
			control="compact"
		>
			<form
				id="research-key"
				onSubmit={(event) => {
					event.preventDefault();
					save.mutate({ apiKey: draft.trim() });
				}}
			>
				<Field>
					<FieldLabel htmlFor={keyId}>Context API key</FieldLabel>
					<Input
						id={keyId}
						type="password"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						placeholder={hint ?? "Paste the key"}
						autoComplete="off"
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						disabled={save.isPending}
					/>
				</Field>
			</form>
		</SettingsCard>
	);
}
