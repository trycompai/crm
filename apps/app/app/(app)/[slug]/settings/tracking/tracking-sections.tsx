"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { AllowedDomains } from "./allowed-domains";
import { TrackingCookies } from "./tracking-cookies";
import { TrackingRules } from "./tracking-rules";
import { TrackingScript } from "./tracking-script";
import { TrafficSources } from "./traffic-sources";
import { VerifyInstallation } from "./verify-installation";

export function TrackingSections() {
	const trpc = useTRPC();
	const tracking = useQuery(trpc.tracking.settings.queryOptions());

	if (!tracking.data?.ready) {
		return (
			<>
				<AllowedDomains />
				<TrackingRules />
			</>
		);
	}

	return (
		<>
			<TrackingScript />
			<VerifyInstallation />
			{tracking.data.canManage ? <TrafficSources /> : null}
			<TrackingRules />
			<AllowedDomains />
			<TrackingCookies />
		</>
	);
}
