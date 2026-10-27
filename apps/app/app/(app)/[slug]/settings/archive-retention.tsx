"use client";

import { Button } from "@crm/ui/components/button";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { SettingsCard } from "@crm/ui/components/settings-card";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ArchiveRetention() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const daysId = useId();
	const [draft, setDraft] = useState<string | null>(null);

	const retention = useQuery(trpc.settings.archiveRetention.queryOptions());

	const save = useMutation(
		trpc.settings.setArchiveRetention.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				setDraft(null);
				toast.success("Archive retention saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!retention.data) return null;

	const value = draft ?? String(retention.data.days);
	const days = Number.parseInt(value, 10);
	const unchanged = days === retention.data.days;

	return (
		<SettingsCard
			title="Archived records"
			description="Deleted records are archived and hidden, then pruned for good."
			hint="Days. 180 is the default."
			action={
				<Button
					type="submit"
					form="archive-retention"
					size="sm"
					disabled={
						save.isPending ||
						unchanged ||
						value.trim() === "" ||
						!Number.isFinite(days)
					}
				>
					{save.isPending ? <Spinner data-icon="inline-start" /> : null}
					Save
				</Button>
			}
			control="compact"
		>
			<form
				id="archive-retention"
				onSubmit={(event) => {
					event.preventDefault();
					if (!Number.isFinite(days)) {
						toast.error("Enter a number of days.");
						return;
					}
					save.mutate({ days });
				}}
			>
				<Field>
					<FieldLabel htmlFor={daysId}>Prune archived records after</FieldLabel>
					<Input
						id={daysId}
						inputMode="numeric"
						value={value}
						disabled={save.isPending}
						onChange={(event) => setDraft(event.target.value)}
					/>
				</Field>
			</form>
		</SettingsCard>
	);
}
