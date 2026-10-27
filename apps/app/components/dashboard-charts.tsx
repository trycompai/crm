"use client";

import { Skeleton } from "@crm/ui/components/skeleton";
import { CHART_CONFIG } from "@crm/ui/lib/chart-config";
import dynamic from "next/dynamic";

const load = () => import("@crm/ui/components/dashboard-chart");

const trendLoading = () => (
	<div className="flex w-full min-w-0 flex-col gap-3">
		<div className="p-1" style={{ height: CHART_CONFIG.height.dashboardTrend }}>
			<Skeleton className="h-full w-full" />
		</div>
		<div className="flex min-h-5 items-center px-5 md:px-6">
			<Skeleton className="h-3 w-48" />
		</div>
	</div>
);

const donutLoading = () => (
	<div className="flex w-full min-w-0 flex-col items-center">
		<Skeleton
			className="aspect-square max-w-full rounded-full"
			style={{ height: CHART_CONFIG.height.dashboardDonut }}
		/>
	</div>
);

export type {
	DonutSlice,
	SeriesConfig,
} from "@crm/ui/components/dashboard-chart";

export const AreaTrend = dynamic(() => load().then((m) => m.AreaTrend), {
	ssr: false,
	loading: trendLoading,
});

export const DonutStat = dynamic(() => load().then((m) => m.DonutStat), {
	ssr: false,
	loading: donutLoading,
});
