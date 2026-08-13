import { cn } from "@crm/ui/lib/utils";

const LIVE = new Set(["ACTIVE", "SENDING"]);

const LABELS: Record<string, string> = {
	DRAFT: "Draft",
	PENDING_APPROVAL: "Needs review",
	SCHEDULED: "Scheduled",
	SENDING: "Sending",
	SENT: "Sent",
	ACTIVE: "Live",
	PAUSED: "Paused",
	DRAINING: "Finishing",
	CANCELLED: "Cancelled",
	ARCHIVED: "Archived",
	FAILED: "Failed",
};

export function CampaignStatus({ status }: { status: string }) {
	const live = LIVE.has(status);

	return (
		<span
			className={cn(
				"flex items-center gap-2",
				live ? "text-primary" : "text-muted-foreground",
			)}
		>
			{live ? <span className="size-1.5 shrink-0 bg-primary" /> : null}
			{LABELS[status] ?? status}
		</span>
	);
}
