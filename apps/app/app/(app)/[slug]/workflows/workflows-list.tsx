"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Card, CardContent } from "@crm/ui/components/card";
import { Skeleton } from "@crm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

const STATUS_TONE: Record<string, string> = {
	ACTIVE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	DRAFT: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	PAUSED: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
	ARCHIVED: "bg-muted text-muted-foreground",
};

const TRIGGER_LABEL: Record<string, string> = {
	CONTACT_CREATED: "Contact created",
	DEAL_STAGE_CHANGED: "Deal stage changed",
	FORM_SUBMITTED: "Form submitted",
	SMS_RECEIVED: "SMS received",
	SCHEDULE: "Schedule",
	MANUAL: "Manual",
};

export function WorkflowsList() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery(
		trpc.workflows.list.queryOptions({
			q: "",
			status: "all",
			trigger: "all",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 50,
		}),
	);

	const update = useMutation(
		trpc.workflows.update.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.workflows.list.queryKey(),
				});
			},
		}),
	);

	if (isLoading) return <Skeleton className="h-40" />;
	if (!data || data.rows.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center gap-2 py-14 text-center">
					<p className="text-lg font-medium">No workflows yet</p>
					<p className="max-w-sm text-sm text-muted-foreground">
						Automate a repeatable task. First one to build: "New form submission
						→ Send welcome SMS."
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
			{data.rows.map((row) => (
				<Card key={row.id}>
					<CardContent className="flex flex-col gap-3 py-4">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<h3 className="truncate font-medium">{row.name}</h3>
									<Badge className={STATUS_TONE[row.status]}>
										{row.status.toLowerCase()}
									</Badge>
								</div>
								{row.description && (
									<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
										{row.description}
									</p>
								)}
							</div>
						</div>

						<div className="grid grid-cols-3 gap-4 border-t pt-3 text-xs text-muted-foreground">
							<div>
								<div className="text-foreground">
									{TRIGGER_LABEL[row.triggerKind] ?? row.triggerKind}
								</div>
								<div>Trigger</div>
							</div>
							<div>
								<div className="text-foreground">{row.stepCount}</div>
								<div>Steps</div>
							</div>
							<div>
								<div className="text-foreground">{row.runCount}</div>
								<div>Runs</div>
							</div>
						</div>

						<div className="flex gap-2 pt-1">
							{row.status === "ACTIVE" ? (
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										update.mutate({
											id: row.id,
											data: { status: "PAUSED" },
										})
									}
								>
									Pause
								</Button>
							) : (
								<Button
									size="sm"
									onClick={() =>
										update.mutate({
											id: row.id,
											data: { status: "ACTIVE" },
										})
									}
								>
									Activate
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
