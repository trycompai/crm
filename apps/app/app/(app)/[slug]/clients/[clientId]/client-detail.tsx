"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Skeleton } from "@crm/ui/components/skeleton";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function ClientDetail({ clientId }: { clientId: string }) {
	const trpc = useTRPC();
	const url = useWorkspaceUrl();
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery(
		trpc.clientAccounts.byId.queryOptions({ id: clientId }),
	);
	const remove = useMutation(
		trpc.clientAccounts.delete.mutationOptions({
			onSuccess: async () => {
				toast.success("Client archived");
				await queryClient.invalidateQueries({
					queryKey: trpc.clientAccounts.list.queryKey(),
				});
				window.history.back();
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	if (isLoading || !data) return <Skeleton className="h-64" />;

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
			<div className="flex items-start gap-4">
				<Link
					href={url("/clients")}
					className="text-sm text-muted-foreground hover:underline"
				>
					← All clients
				</Link>
			</div>
			<header className="flex items-start gap-4">
				{data.logoUrl ? (
					// biome-ignore lint/performance/noImgElement: external client logo URLs are not allowlisted for next/image
					<img
						src={data.logoUrl}
						alt=""
						className="size-16 rounded-lg border object-cover"
					/>
				) : (
					<div
						className="flex size-16 items-center justify-center rounded-lg text-2xl font-medium text-white"
						style={{ background: data.brandColor ?? "hsl(160 100% 20%)" }}
					>
						{data.name.charAt(0).toUpperCase()}
					</div>
				)}
				<div className="flex-1">
					<h1 className="text-2xl font-semibold">{data.name}</h1>
					<div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
						<Badge>{data.status.toLowerCase()}</Badge>
						{data.industry && <span>{data.industry}</span>}
						{data.website && (
							<a
								href={data.website}
								target="_blank"
								rel="noreferrer"
								className="hover:underline"
							>
								{data.website.replace(/^https?:\/\//, "")}
							</a>
						)}
					</div>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						if (confirm(`Archive ${data.name}? Records stay but unlink.`))
							remove.mutate({ id: data.id });
					}}
				>
					Archive
				</Button>
			</header>

			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<Kpi label="Contacts" value={data.counts.contacts} />
				<Kpi label="Companies" value={data.counts.companies} />
				<Kpi label="Deals" value={data.counts.deals} />
				<Kpi
					label="Monthly retainer"
					value={
						data.monthlyRetainerCents !== null
							? formatMoney(Number(data.monthlyRetainerCents), data.currency)
							: "—"
					}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Notes</CardTitle>
				</CardHeader>
				<CardContent>
					{data.notes ? (
						<p className="whitespace-pre-wrap text-sm">{data.notes}</p>
					) : (
						<p className="text-sm text-muted-foreground">
							No notes yet. Add one from the edit sheet.
						</p>
					)}
				</CardContent>
			</Card>

			<div className="grid gap-4 md:grid-cols-3">
				<QuickCard
					href={url(`/deals?clientAccountId=${data.id}`)}
					title="Deals"
					body={`${data.counts.deals} tracked deal${data.counts.deals === 1 ? "" : "s"}`}
				/>
				<QuickCard
					href={url(`/contacts?clientAccountId=${data.id}`)}
					title="Contacts"
					body={`${data.counts.contacts} contact${data.counts.contacts === 1 ? "" : "s"} on file`}
				/>
				<QuickCard
					href={url(`/workflows?clientAccountId=${data.id}`)}
					title="Automations"
					body={`${data.counts.workflows} workflow${data.counts.workflows === 1 ? "" : "s"}`}
				/>
			</div>
		</div>
	);
}

function Kpi({ label, value }: { label: string; value: number | string }) {
	return (
		<Card>
			<CardContent className="py-4">
				<div className="text-xs uppercase tracking-wide text-muted-foreground">
					{label}
				</div>
				<div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
			</CardContent>
		</Card>
	);
}

function QuickCard({
	href,
	title,
	body,
}: {
	href: string;
	title: string;
	body: string;
}) {
	return (
		<Link
			href={href}
			className="rounded-lg border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
		>
			<div className="text-sm font-medium">{title}</div>
			<div className="mt-1 text-xs text-muted-foreground">{body}</div>
		</Link>
	);
}
