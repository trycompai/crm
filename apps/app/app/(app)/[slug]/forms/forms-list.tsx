"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Card, CardContent } from "@crm/ui/components/card";
import { Skeleton } from "@crm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const STATUS_TONE: Record<string, string> = {
	PUBLISHED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	DRAFT: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	ARCHIVED: "bg-muted text-muted-foreground",
};

export function FormsList() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery(
		trpc.forms.list.queryOptions({
			q: "",
			status: "all",
			clientAccountId: "all",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 50,
		}),
	);

	const publishToggle = useMutation(
		trpc.forms.update.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.forms.list.queryKey(),
				});
				toast.success("Updated");
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	const remove = useMutation(
		trpc.forms.delete.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.forms.list.queryKey(),
				});
				toast.success("Deleted");
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	if (isLoading) return <Skeleton className="h-40" />;
	if (!data || data.rows.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center gap-2 py-14 text-center">
					<p className="text-lg font-medium">No forms yet</p>
					<p className="max-w-sm text-sm text-muted-foreground">
						Build a lead-capture form, publish it, then embed the URL anywhere.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
			{data.rows.map((row) => (
				<Card key={row.id}>
					<CardContent className="flex flex-col gap-3 py-4">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
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

						<div className="flex items-baseline justify-between border-t pt-3 text-xs text-muted-foreground">
							<span>{row.fieldCount} fields</span>
							<span>
								{row.submissionCount} submission
								{row.submissionCount === 1 ? "" : "s"}
							</span>
						</div>

						<div className="flex gap-2 pt-1">
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => {
									const url = `${window.location.origin}/api/public/forms/${row.slug}`;
									navigator.clipboard.writeText(url);
									toast.success("Public URL copied");
								}}
							>
								Copy URL
							</Button>
							{row.status !== "PUBLISHED" ? (
								<Button
									type="button"
									size="sm"
									onClick={() =>
										publishToggle.mutate({
											id: row.id,
											data: { status: "PUBLISHED" },
										})
									}
								>
									Publish
								</Button>
							) : (
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() =>
										publishToggle.mutate({
											id: row.id,
											data: { status: "DRAFT" },
										})
									}
								>
									Unpublish
								</Button>
							)}
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="ml-auto text-destructive"
								onClick={() => {
									if (confirm(`Delete "${row.name}"?`))
										remove.mutate({ id: row.id });
								}}
							>
								Delete
							</Button>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
