"use client";

import { Button } from "@crm/ui/components/button";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LocalRelativeDate } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Marketing = RouterOutputs["marketingCampaigns"]["forContact"];
type Enrolment = Marketing["enrolments"][number];
type Send = Marketing["sends"][number];

const STATUS_NOTE: Record<string, string> = {
	SUBSCRIBED: "Marketing mail can go to this address.",
	UNSUBSCRIBED: "They unsubscribed. Nothing marketing can reach them again.",
	BOUNCED: "The address hard bounced. Nothing more is sent to it.",
	COMPLAINED: "They marked mail as spam. Nothing more is sent to them.",
};

function Panel({
	title,
	note,
	children,
}: {
	title: string;
	note?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col overflow-clip rounded-lg border">
			<div className="flex items-center justify-between gap-3 border-b bg-muted px-4 py-2.5">
				<span className="font-medium text-xs">{title}</span>
				{note ? (
					<span className="truncate text-muted-foreground text-xs">{note}</span>
				) : null}
			</div>
			{children}
		</div>
	);
}

function Empty({ children }: { children: React.ReactNode }) {
	return (
		<p className="px-4 py-6 text-center text-muted-foreground text-xs">
			{children}
		</p>
	);
}

function outcome(send: Send): string {
	if (send.repliedAt) return "Replied";
	if (send.clickedAt) return "Clicked";
	if (send.openedAt) return "Opened";
	if (send.skipReason) return send.skipReason;
	return send.status.charAt(0) + send.status.slice(1).toLowerCase();
}

export function ContactMarketing({ contactId }: { contactId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const marketing = useQuery(
		trpc.marketingCampaigns.forContact.queryOptions({ id: contactId }),
	);

	const unenrol = useMutation(
		trpc.marketingCampaigns.unenrol.mutationOptions({
			onSuccess: () => {
				toast.success("Removed. Their queued emails are cancelled.");
				void queryClient.invalidateQueries({
					queryKey: trpc.marketingCampaigns.forContact.queryKey({
						id: contactId,
					}),
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (marketing.isPending) {
		return (
			<div className="flex items-center justify-center py-10">
				<Spinner />
			</div>
		);
	}

	if (marketing.isError) {
		return <Empty>This tab did not load. {marketing.error.message}</Empty>;
	}

	const data = marketing.data;
	if (!data) return <Empty>Nothing to show.</Empty>;

	const recipient = data.recipient;
	const written = data.sends.length > 0;

	return (
		<div className="flex flex-col gap-6 p-5">
			<Panel title="Marketing status" note={recipient?.address ?? undefined}>
				<div className="flex flex-col gap-1 px-4 py-3">
					{recipient ? (
						<>
							<span className="font-medium text-xs">
								{recipient.status.charAt(0) +
									recipient.status.slice(1).toLowerCase()}
							</span>
							<span className="text-muted-foreground text-xs">
								{STATUS_NOTE[recipient.status] ??
									"This address has had no marketing mail."}
							</span>
							{recipient.statusReason ? (
								<span className="text-muted-foreground text-xs">
									{recipient.statusReason}
								</span>
							) : null}
						</>
					) : written ? (
						<>
							<span className="font-medium text-xs">
								The address is on another contact
							</span>
							<span className="text-muted-foreground text-xs">
								Marketing has written to this person. Another contact holds the
								same address, so the subscription status lives there. The sends
								below are still theirs.
							</span>
						</>
					) : (
						<>
							<span className="font-medium text-xs">No marketing address</span>
							<span className="text-muted-foreground text-xs">
								Marketing has never written to this contact, so there is no
								address on record yet.
							</span>
						</>
					)}
				</div>
			</Panel>

			<Panel
				title="Campaigns they are in"
				note="Removing somebody cancels the emails they have not had yet."
			>
				{data.enrolments.length === 0 ? (
					<Empty>They are in no campaign.</Empty>
				) : (
					data.enrolments.map((row: Enrolment) => (
						<div
							key={row.id}
							className="flex items-center gap-3 border-b px-4 py-2.5 text-xs last:border-b-0"
						>
							<span className="min-w-0 flex-1 truncate font-medium">
								{row.campaign.name}
							</span>

							<span className="min-w-0 flex-1 truncate text-muted-foreground">
								{row.status === "ACTIVE"
									? (row.nodeLabel ?? "Not started")
									: (row.exitReason ?? "Left")}
							</span>

							{row.status === "ACTIVE" && row.nextDueAt ? (
								<span
									className={
										row.stuck ? "text-destructive" : "text-muted-foreground"
									}
								>
									{row.stuck ? "Overdue " : "Next "}
									<LocalRelativeDate date={row.nextDueAt} />
								</span>
							) : null}

							{row.status === "ACTIVE" ? (
								<Button
									variant="ghost"
									size="sm"
									disabled={unenrol.isPending}
									onClick={() => unenrol.mutate({ id: row.id })}
								>
									Remove
								</Button>
							) : null}
						</div>
					))
				)}
			</Panel>

			<Panel
				title="Marketing send activity"
				note="Sent, queued, skipped and failed alike."
			>
				{data.sends.length === 0 ? (
					<Empty>No marketing email has been queued for them.</Empty>
				) : (
					data.sends.map((send: Send) => (
						<div
							key={send.id}
							className="flex items-center gap-3 border-b px-4 py-2.5 text-xs last:border-b-0"
						>
							<span className="min-w-0 flex-1 truncate">
								{send.subject || "No subject"}
							</span>
							<span className="min-w-0 flex-1 truncate text-muted-foreground">
								{send.campaign?.name ?? "One-off"}
							</span>
							<span className="w-20 shrink-0 truncate">{outcome(send)}</span>
							<span className="w-20 shrink-0 text-right text-muted-foreground">
								{send.sentAt ? <LocalRelativeDate date={send.sentAt} /> : "—"}
							</span>
						</div>
					))
				)}
			</Panel>
		</div>
	);
}
