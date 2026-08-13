"use client";

import Bullhorn from "@carbon/icons-react/es/Bullhorn";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Filters = { owner: string; company: string };

type Rule = { label: string; facet: Record<string, unknown> };

export function rulesFrom(filters: Filters): Rule[] {
	const rules: Rule[] = [
		{ label: "Has an email address", facet: { facet: "contact.hasEmail" } },
	];

	if (filters.owner !== "all" && filters.owner !== "none") {
		rules.push({
			label: "Owned by the person you filtered on",
			facet: { facet: "contact.owner", userId: filters.owner },
		});
	}

	return rules;
}

export function SaveAsSegment({ filters }: { filters: Filters }) {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();

	const [open, setOpen] = useQueryState(
		"segment",
		parseAsBoolean.withDefault(false),
	);
	const [name, setName] = useState("");

	const rules = rulesFrom(filters);
	const dropped = filters.company !== "all";

	const create = useMutation(
		trpc.marketingSegments.create.mutationOptions({
			onSuccess: async (segment) => {
				await setOpen(null);
				setName("");
				toast.success("Saved. Check the rules before you send to it.");
				router.push(workspaceUrl(`/marketing/segments/${segment.id}`));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<>
			<Button variant="outline" size="sm" onClick={() => void setOpen(true)}>
				<Icon icon={Bullhorn} data-icon="inline-start" />
				<span className="hidden sm:inline">Save as segment</span>
			</Button>

			<Dialog open={open} onOpenChange={(next) => void setOpen(next || null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Save this view as a segment</DialogTitle>
						<DialogDescription>
							A segment is a saved question, not a saved list. It answers itself
							again every time a campaign asks.
						</DialogDescription>
					</DialogHeader>

					<Field>
						<FieldLabel htmlFor="segment-name">Name</FieldLabel>
						<Input
							id="segment-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Owned by me, from the website"
						/>
					</Field>

					<div className="flex flex-col gap-1.5 rounded-md border p-3">
						<span className="font-medium text-xs">Rules it will hold</span>
						{rules.map((rule) => (
							<span key={rule.label} className="text-muted-foreground text-xs">
								{rule.label}
							</span>
						))}
						{dropped ? (
							<span className="text-destructive text-xs">
								The company filter is not carried. Segments have no company
								rule, so add one by hand if you need it.
							</span>
						) : null}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => void setOpen(null)}>
							Cancel
						</Button>
						<Button
							disabled={!name.trim() || create.isPending}
							onClick={() =>
								create.mutate({
									name: name.trim(),
									definition: {
										all: rules.map((rule) => ({ facet: rule.facet })),
									},
								})
							}
						>
							{create.isPending ? <Spinner /> : null}
							Create
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
