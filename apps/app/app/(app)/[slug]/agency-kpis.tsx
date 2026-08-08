"use client";

import { Card, CardContent } from "@crm/ui/components/card";
import { Skeleton } from "@crm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function AgencyKpis() {
	const trpc = useTRPC();
	const url = useWorkspaceUrl();
	const clients = useQuery(
		trpc.clientAccounts.list.queryOptions({
			q: "",
			status: "ACTIVE",
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 1,
		}),
	);
	const inbox = useQuery(
		trpc.sms.list.queryOptions({
			q: "",
			unread: "unread",
			clientAccountId: "all",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 1,
		}),
	);
	const workflows = useQuery(
		trpc.workflows.list.queryOptions({
			q: "",
			status: "ACTIVE",
			trigger: "all",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 1,
		}),
	);
	const forms = useQuery(
		trpc.forms.list.queryOptions({
			q: "",
			status: "PUBLISHED",
			clientAccountId: "all",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 1,
		}),
	);

	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
			<KpiCard
				label="Active clients"
				value={clients.data?.total}
				loading={clients.isLoading}
				href={url("/clients")}
			/>
			<KpiCard
				label="Unread inbox"
				value={inbox.data?.total}
				loading={inbox.isLoading}
				href={url("/inbox")}
				tone={
					inbox.data?.total && inbox.data.total > 0 ? "attention" : "default"
				}
			/>
			<KpiCard
				label="Live workflows"
				value={workflows.data?.total}
				loading={workflows.isLoading}
				href={url("/workflows")}
			/>
			<KpiCard
				label="Published forms"
				value={forms.data?.total}
				loading={forms.isLoading}
				href={url("/forms")}
			/>
		</div>
	);
}

function KpiCard({
	label,
	value,
	loading,
	href,
	tone = "default",
}: {
	label: string;
	value: number | undefined;
	loading: boolean;
	href: string;
	tone?: "default" | "attention";
}) {
	const inner = (
		<Card
			className={`transition-all hover:border-primary/40 hover:shadow-md ${
				tone === "attention" && value && value > 0
					? "border-primary/60 bg-primary/5"
					: ""
			}`}
		>
			<CardContent className="py-4">
				<div className="text-xs uppercase tracking-wide text-muted-foreground">
					{label}
				</div>
				<div className="mt-1 text-3xl font-semibold tabular-nums">
					{loading ? (
						<Skeleton className="h-8 w-12" />
					) : (
						(value ?? 0).toLocaleString()
					)}
				</div>
			</CardContent>
		</Card>
	);
	return (
		<Link href={href} className="block">
			{inner}
		</Link>
	);
}
