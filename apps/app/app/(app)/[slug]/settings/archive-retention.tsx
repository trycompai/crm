"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ArchiveRetention() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const daysId = useId();
	const [draft, setDraft] = useState("");

	const retention = useQuery(trpc.settings.archiveRetention.queryOptions());

	useEffect(() => {
		if (retention.data) setDraft(String(retention.data.days));
	}, [retention.data]);

	const save = useMutation(
		trpc.settings.setArchiveRetention.mutationOptions({
			onSuccess: async () => {
				await cache.settings();
				toast.success("Archive retention saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!retention.data) return null;

	const days = Number.parseInt(draft, 10);
	const unchanged = days === retention.data.days;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Archived records</CardTitle>
				<CardDescription>
					Deleted records are archived and hidden, then pruned for good.
				</CardDescription>

				<CardAction>
					<Button
						type="submit"
						form="archive-retention"
						disabled={
							save.isPending ||
							unchanged ||
							draft.trim() === "" ||
							!Number.isFinite(days)
						}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
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
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={daysId}>
								Prune archived records after
							</FieldLabel>
							<Input
								id={daysId}
								inputMode="numeric"
								value={draft}
								disabled={save.isPending}
								onChange={(event) => setDraft(event.target.value)}
							/>
							<FieldDescription>Days. 180 is the default.</FieldDescription>
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
