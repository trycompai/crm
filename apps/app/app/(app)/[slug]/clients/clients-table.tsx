"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Card, CardContent } from "@crm/ui/components/card";
import { Skeleton } from "@crm/ui/components/skeleton";
import { formatMoney } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { CreateClientSheet } from "./create-client-sheet";

const STATUS_TONE: Record<string, string> = {
	ACTIVE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	ONBOARDING: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
	PAUSED: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	CHURNED: "bg-muted text-muted-foreground",
};

export function ClientsTable() {
	const trpc = useTRPC();
	const [status, setStatus] = useState<string>("all");
	const [q, setQ] = useState("");

	const { data, isLoading } = useQuery(
		trpc.clientAccounts.list.queryOptions({
			q,
			status,
			sort: "name",
			dir: "asc",
			page: 1,
			pageSize: 50,
		}),
	);

	const facetCounts = data?.facetCounts.status ?? {};
	const total = data?.total ?? 0;

	const tabs = [
		{ id: "all", label: "All", count: total },
		{ id: "ACTIVE", label: "Active", count: facetCounts.ACTIVE ?? 0 },
		{
			id: "ONBOARDING",
			label: "Onboarding",
			count: facetCounts.ONBOARDING ?? 0,
		},
		{ id: "PAUSED", label: "Paused", count: facetCounts.PAUSED ?? 0 },
		{ id: "CHURNED", label: "Churned", count: facetCounts.CHURNED ?? 0 },
	];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setStatus(tab.id)}
							className={`rounded-sm px-3 py-1 text-sm transition ${
								status === tab.id
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{tab.label}
							<span className="ml-2 text-xs text-muted-foreground">
								{tab.count}
							</span>
						</button>
					))}
				</div>
				<input
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Search clients…"
					className="ml-auto h-9 w-64 max-w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>

			{isLoading ? (
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
					{["a", "b", "c", "d", "e", "f"].map((k) => (
						<Skeleton key={k} className="h-32 rounded-lg" />
					))}
				</div>
			) : data?.rows.length === 0 ? (
				<EmptyState />
			) : (
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
					{data?.rows.map((row) => (
						<ClientCard key={row.id} row={row} />
					))}
				</div>
			)}
		</div>
	);
}

function EmptyState() {
	return (
		<Card>
			<CardContent className="flex flex-col items-center gap-3 py-14 text-center">
				<p className="text-lg font-medium">No clients yet</p>
				<p className="max-w-sm text-sm text-muted-foreground">
					A client is a business you serve. Every contact, deal and form can
					belong to one, so filtering by client is one click away.
				</p>
				<CreateClientSheet
					trigger={<Button size="sm">Add your first client</Button>}
				/>
			</CardContent>
		</Card>
	);
}

function ClientCard({
	row,
}: {
	row: {
		id: string;
		name: string;
		slug: string;
		status: string;
		logoUrl: string | null;
		brandColor: string | null;
		website: string | null;
		industry: string | null;
		monthlyRetainerCents: string | null;
		currency: string;
		tags: string[];
		companyCount: number;
		contactCount: number;
		openDealCount: number;
	};
}) {
	const url = useWorkspaceUrl();
	const retainer =
		row.monthlyRetainerCents !== null
			? formatMoney(Number(row.monthlyRetainerCents), row.currency)
			: null;

	return (
		<Link
			href={url(`/clients/${row.id}`)}
			className="group block rounded-lg border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div className="flex items-start gap-3">
				{row.logoUrl ? (
					// biome-ignore lint/performance/noImgElement: external client logo URLs are not allowlisted for next/image
					<img
						src={row.logoUrl}
						alt=""
						className="size-12 shrink-0 rounded-md border object-cover"
					/>
				) : (
					<div
						className="flex size-12 shrink-0 items-center justify-center rounded-md text-lg font-medium text-white"
						style={{ background: row.brandColor ?? "hsl(160 100% 20%)" }}
					>
						{row.name.charAt(0).toUpperCase()}
					</div>
				)}
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="truncate text-base font-medium leading-tight">
							{row.name}
						</h3>
						<Badge className={STATUS_TONE[row.status] ?? ""}>
							{row.status.toLowerCase()}
						</Badge>
					</div>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{row.industry ?? row.website ?? row.slug}
					</p>
				</div>
			</div>

			<div className="mt-4 grid grid-cols-3 gap-3">
				<Stat label="Contacts" value={row.contactCount} />
				<Stat label="Open deals" value={row.openDealCount} />
				<Stat label="Companies" value={row.companyCount} />
			</div>

			{retainer && (
				<div className="mt-3 flex items-baseline justify-between border-t pt-3">
					<span className="text-xs text-muted-foreground">
						Monthly retainer
					</span>
					<span className="font-medium tabular-nums">{retainer}</span>
				</div>
			)}
		</Link>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div>
			<div className="text-xl font-semibold tabular-nums">{value}</div>
			<div className="text-xs text-muted-foreground">{label}</div>
		</div>
	);
}
