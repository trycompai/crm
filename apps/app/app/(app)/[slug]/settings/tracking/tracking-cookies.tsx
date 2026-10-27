"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SettingRow, SettingRows } from "@crm/ui/components/setting-rows";
import { SettingsCard } from "@crm/ui/components/settings-card";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const TOGGLES = [
	{
		flag: "cookieSubdomains",
		label: "Limit cookies to subdomains",
		hint: "Set the cookie on the exact host that served the page, never on the parent domain",
	},
	{
		flag: "secureCookies",
		label: "Use secure cookies only",
		hint: "Send the cookie over HTTPS and drop it on plain HTTP",
	},
	{
		flag: "honourDnt",
		label: "Honour Do Not Track",
		hint: "Record nothing at all when the browser asks not to be tracked",
	},
] as const;

export function TrackingCookies() {
	const trpc = useTRPC();
	const cache = useCrmCache();

	const tracking = useQuery(trpc.tracking.settings.queryOptions());

	const setFlag = useMutation(
		trpc.tracking.setFlag.mutationOptions({
			onSuccess: () => cache.tracking({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const setLifetime = useMutation(
		trpc.tracking.setCookieLifetime.mutationOptions({
			onSuccess: async () => {
				await cache.tracking();
				toast.success("Cookie lifetime saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!tracking.data) return null;

	const { canManage, cookieDays, cookieLifetimes } = tracking.data;
	const busy = !canManage || setFlag.isPending || setLifetime.isPending;

	return (
		<SettingsCard
			title="Cookies"
			description="How a returning visitor is recognised."
			hint="Changes save as you make them."
		>
			<SettingRows>
				{TOGGLES.map((toggle) => (
					<SettingRow
						key={toggle.flag}
						title={toggle.label}
						description={toggle.hint}
						control={(id, describedBy) => (
							<Switch
								id={id}
								aria-describedby={describedBy}
								checked={tracking.data[toggle.flag]}
								disabled={busy}
								onCheckedChange={(enabled) =>
									setFlag.mutate({ flag: toggle.flag, enabled })
								}
							/>
						)}
					/>
				))}

				<SettingRow
					title="Cookie lifetime"
					description="After this a returning visitor counts as somebody new. Shorten it if your policy asks you to."
					control={(id, describedBy) => (
						<Select
							value={String(cookieDays)}
							disabled={busy}
							onValueChange={(value) =>
								setLifetime.mutate({ days: Number(value) })
							}
						>
							<SelectTrigger id={id} aria-describedby={describedBy} size="sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{cookieLifetimes.map((lifetime) => (
									<SelectItem key={lifetime.days} value={String(lifetime.days)}>
										{lifetime.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				/>
			</SettingRows>
		</SettingsCard>
	);
}
