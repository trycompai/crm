"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Skeleton } from "@crm/ui/components/skeleton";
import { Textarea } from "@crm/ui/components/textarea";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

function initials(row: {
	contact: { firstName: string; lastName: string | null } | null;
	theirNumber: string;
}): string {
	const c = row.contact;
	if (c) {
		return `${c.firstName.charAt(0)}${c.lastName?.charAt(0) ?? ""}`.toUpperCase();
	}
	return row.theirNumber.slice(-2);
}

function displayName(row: {
	contact: { firstName: string; lastName: string | null } | null;
	theirNumber: string;
}): string {
	if (row.contact) {
		return `${row.contact.firstName} ${row.contact.lastName ?? ""}`.trim();
	}
	return row.theirNumber;
}

function timeAgo(iso: string): string {
	const d = new Date(iso);
	const diff = Date.now() - d.getTime();
	const s = Math.floor(diff / 1000);
	if (s < 60) return "just now";
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
}

export function InboxUI() {
	const trpc = useTRPC();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [filter, setFilter] = useState<"all" | "unread">("all");

	const list = useQuery(
		trpc.sms.list.queryOptions({
			q: "",
			unread: filter,
			clientAccountId: "all",
			sort: "",
			dir: "asc",
			page: 1,
			pageSize: 50,
		}),
	);

	useEffect(() => {
		const firstRow = list.data?.rows[0];
		if (!selectedId && firstRow) {
			setSelectedId(firstRow.id);
		}
	}, [list.data, selectedId]);

	const rows = list.data?.rows ?? [];
	const facet = list.data?.facetCounts.unread ?? {};

	return (
		<div className="grid h-full grid-cols-1 md:grid-cols-[320px_1fr]">
			<aside className="flex flex-col border-r">
				<div className="flex items-center gap-1 border-b p-2">
					<button
						type="button"
						onClick={() => setFilter("all")}
						className={cn(
							"rounded-sm px-2 py-1 text-xs",
							filter === "all"
								? "bg-muted text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						All{" "}
						<span className="ml-1 text-muted-foreground">{facet.all ?? 0}</span>
					</button>
					<button
						type="button"
						onClick={() => setFilter("unread")}
						className={cn(
							"rounded-sm px-2 py-1 text-xs",
							filter === "unread"
								? "bg-muted text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						Unread{" "}
						<span className="ml-1 text-muted-foreground">
							{facet.unread ?? 0}
						</span>
					</button>
				</div>
				<div className="flex-1 overflow-y-auto">
					{list.isLoading ? (
						<div className="p-3">
							<Skeleton className="h-16" />
						</div>
					) : rows.length === 0 ? (
						<div className="p-6 text-center text-sm text-muted-foreground">
							No messages yet. Connect Twilio in Settings and inbound SMS lands
							here.
						</div>
					) : (
						<ul>
							{rows.map((row) => (
								<li key={row.id}>
									<button
										type="button"
										onClick={() => setSelectedId(row.id)}
										className={cn(
											"flex w-full flex-col items-start gap-1 border-b px-3 py-3 text-left transition-colors hover:bg-muted/50",
											selectedId === row.id && "bg-muted/70",
										)}
									>
										<div className="flex w-full items-baseline justify-between gap-2">
											<div className="flex items-center gap-2 min-w-0">
												<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
													{initials(row)}
												</div>
												<span className="truncate font-medium">
													{displayName(row)}
												</span>
											</div>
											<span className="text-xs text-muted-foreground">
												{timeAgo(row.lastMessageAt)}
											</span>
										</div>
										<div className="flex w-full items-center justify-between gap-2 pl-10">
											<span className="line-clamp-1 text-xs text-muted-foreground">
												{row.lastPreview ?? "…"}
											</span>
											{row.unreadCount > 0 && (
												<Badge className="bg-primary text-primary-foreground text-[10px]">
													{row.unreadCount}
												</Badge>
											)}
										</div>
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			</aside>

			{selectedId ? (
				<ThreadView key={selectedId} threadId={selectedId} />
			) : (
				<div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
					Select a conversation
				</div>
			)}
		</div>
	);
}

function ThreadView({ threadId }: { threadId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState("");

	const { data, isLoading } = useQuery(
		trpc.sms.thread.queryOptions({ id: threadId }),
	);

	const markRead = useMutation(
		trpc.sms.markRead.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.sms.list.queryKey(),
				});
			},
		}),
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — fire on unread transitions only
	useEffect(() => {
		if (data && data.unreadCount > 0) markRead.mutate({ threadId });
	}, [threadId, data?.unreadCount]);

	const send = useMutation(
		trpc.sms.send.mutationOptions({
			onSuccess: async () => {
				toast.success("Sent");
				setDraft("");
				await queryClient.invalidateQueries({
					queryKey: trpc.sms.thread.queryKey({ id: threadId }),
				});
				await queryClient.invalidateQueries({
					queryKey: trpc.sms.list.queryKey(),
				});
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	if (isLoading || !data)
		return (
			<div className="p-6">
				<Skeleton className="h-64" />
			</div>
		);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="flex items-center gap-3 border-b px-4 py-3">
				<div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
					{initials({ contact: data.contact, theirNumber: data.theirNumber })}
				</div>
				<div className="flex-1">
					<div className="font-medium">
						{displayName({
							contact: data.contact,
							theirNumber: data.theirNumber,
						})}
					</div>
					<div className="text-xs text-muted-foreground">
						{data.theirNumber} · via {data.ourNumber}
					</div>
				</div>
			</header>

			<div className="flex-1 overflow-y-auto p-4">
				<div className="mx-auto flex max-w-2xl flex-col gap-3">
					{data.messages.map((msg) => (
						<div
							key={msg.id}
							className={cn(
								"flex",
								msg.direction === "OUTBOUND" ? "justify-end" : "justify-start",
							)}
						>
							<div
								className={cn(
									"max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed",
									msg.direction === "OUTBOUND"
										? "bg-primary text-primary-foreground"
										: "bg-muted",
								)}
							>
								<div className="whitespace-pre-wrap">{msg.body}</div>
								<div
									className={cn(
										"mt-1 text-[10px]",
										msg.direction === "OUTBOUND"
											? "text-primary-foreground/70"
											: "text-muted-foreground",
									)}
								>
									{new Date(msg.sentAt).toLocaleTimeString([], {
										hour: "numeric",
										minute: "2-digit",
									})}
									{msg.status === "FAILED" && (
										<span className="ml-2 text-destructive">Failed</span>
									)}
								</div>
							</div>
						</div>
					))}
					{data.messages.length === 0 && (
						<div className="text-center text-sm text-muted-foreground">
							No messages yet
						</div>
					)}
				</div>
			</div>

			<footer className="border-t p-3">
				<div className="mx-auto flex max-w-2xl gap-2">
					<Textarea
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder="Type a message…"
						className="min-h-11 flex-1 resize-none"
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								if (draft.trim()) {
									send.mutate({
										to: data.theirNumber,
										body: draft.trim(),
										contactId: data.contact?.id,
									});
								}
							}
						}}
					/>
					<Button
						type="button"
						disabled={!draft.trim() || send.isPending}
						onClick={() =>
							send.mutate({
								to: data.theirNumber,
								body: draft.trim(),
								contactId: data.contact?.id,
							})
						}
					>
						{send.isPending ? "Sending…" : "Send"}
					</Button>
				</div>
			</footer>
		</div>
	);
}
