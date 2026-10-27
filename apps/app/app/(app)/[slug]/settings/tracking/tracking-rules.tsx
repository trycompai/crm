"use client";

import { SettingRow, SettingRows } from "@crm/ui/components/setting-rows";
import { SettingsCard } from "@crm/ui/components/settings-card";
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
		<SettingsCard
			title="Tracking rules"
			description="Where the script may run, and how it follows a visitor."
			hint="Changes save as you make them."
		>
			<SettingRows>
				{RULES.map((rule) => (
					<SettingRow
						key={rule.flag}
						title={rule.label}
						description={rule.hint}
						control={(id, describedBy) => (
							<Switch
								id={id}
								aria-describedby={describedBy}
								checked={tracking.data[rule.flag]}
								disabled={!canManage || setFlag.isPending}
								onCheckedChange={(enabled) =>
									setFlag.mutate({ flag: rule.flag, enabled })
								}
							/>
						)}
					/>
				))}
			</SettingRows>
		</SettingsCard>
	);
}
