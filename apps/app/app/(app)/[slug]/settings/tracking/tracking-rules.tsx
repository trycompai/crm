"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Label } from "@crm/ui/components/label";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const RULES = [
	{
		flag: "crossDomain",
		label: "Automatic cross-domain linking",
		hint: "Carry the visitor between the domains below, so one journey is not counted as two people",
	},
	{
		flag: "limitToDomains",
		label: "Limit tracking to the domains below",
		hint: "On any other domain the script loads and then does nothing",
	},
] as const;

export function TrackingRules() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const tracking = useQuery(trpc.tracking.settings.queryOptions());

	const setFlag = useMutation(
		trpc.tracking.setFlag.mutationOptions({
			onSuccess: () => cache.tracking({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!tracking.data) return null;

	const { canManage } = tracking.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Tracking rules</CardTitle>
				<CardDescription>
					Where the script may run, and how it follows a visitor.
				</CardDescription>
			</CardHeader>

			<CardContent>
				{RULES.map((rule) => (
					<div
						key={rule.flag}
						className="flex items-center justify-between gap-6"
					>
						<Label
							htmlFor={`tracking-${rule.flag}`}
							className="flex flex-col items-start gap-1"
						>
							<span className="text-sm">{rule.label}</span>
							<span className="font-normal text-muted-foreground text-xs">
								{rule.hint}
							</span>
						</Label>

						<Switch
							id={`tracking-${rule.flag}`}
							checked={tracking.data[rule.flag]}
							disabled={!canManage || setFlag.isPending}
							onCheckedChange={(enabled) =>
								setFlag.mutate({ flag: rule.flag, enabled })
							}
						/>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
