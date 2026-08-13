"use client";

import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const RESEND_DOMAINS_URL = "https://resend.com/domains";

const STATUS_LABEL: Record<string, string> = {
	verified: "verified",
	pending: "pending",
	not_started: "not started",
	temporary_failure: "temporary failure",
	failure: "failed",
};

function statusLabel(status: string): string {
	return STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

function useRefreshDomains() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	return () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.marketing.domains.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.marketing.domain.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.marketing.settings.queryKey(),
			}),
		]);
}

export function SendingDomainActions() {
	const trpc = useTRPC();
	const refresh = useRefreshDomains();
	const domains = useQuery(trpc.marketing.domains.queryOptions());

	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				disabled={domains.isFetching}
				onClick={() => void refresh()}
			>
				{domains.isFetching ? <Spinner /> : null}
				Refresh
			</Button>
			<Button variant="outline" size="sm" asChild>
				<a href={RESEND_DOMAINS_URL} target="_blank" rel="noreferrer">
					Open Resend
				</a>
			</Button>
		</>
	);
}

export function SendingDomains() {
	const trpc = useTRPC();
	const refresh = useRefreshDomains();

	const domains = useQuery(trpc.marketing.domains.queryOptions());

	const choose = useMutation(
		trpc.marketing.useDomain.mutationOptions({
			onSuccess: async (result) => {
				await refresh();
				toast.success(`Sending from ${result.name}.`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const rows = domains.data ?? [];

	if (domains.isPending) return <Spinner />;

	return (
		<div className="flex flex-col">
			{rows.map((row) => {
				const verified = row.status === "verified";

				return (
					<div
						key={row.id}
						className="flex items-center gap-3 border-b py-2.5 first:pt-0 last:border-b-0"
					>
						<span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
						<span className="text-muted-foreground text-xs">
							{statusLabel(row.status)}
						</span>
						{row.selected ? (
							<span className="text-xs">In use</span>
						) : (
							<Button
								variant="outline"
								size="sm"
								disabled={!verified || choose.isPending}
								onClick={() => choose.mutate({ id: row.id })}
							>
								{choose.isPending ? <Spinner /> : null}
								Use it
							</Button>
						)}
					</div>
				);
			})}

			<p className="pt-3 text-muted-foreground text-xs">
				{rows.length === 0
					? "Resend has no domains yet. Add one there and verify it, then it shows up here."
					: "Only a domain Resend has verified can send. Add and verify domains in Resend."}
			</p>
		</div>
	);
}
