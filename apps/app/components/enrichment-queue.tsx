"use client";

import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import { Button } from "@crm/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@crm/ui/components/collapsible";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import {
	IndicatorDot,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { cn } from "@crm/ui/lib/utils";
import {
	ENRICHMENT_PAGE,
	ENRICHMENT_PAGE_MAX,
} from "@crm/validation/enrichment-queue";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { elapsedLabel, queueFooter } from "@/lib/enrichment-queue";
import {
	ENRICHMENT_IDLE_POLL_MS,
	ENRICHMENT_POLL_MS,
} from "@/lib/enrichment-status";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useSeconds } from "@/lib/use-seconds";

type QueueRow = RouterOutputs["enrichment"]["queue"]["rows"][number];
type ScheduledRow = RouterOutputs["enrichment"]["queue"]["scheduled"][number];
type QueueSubject = QueueRow["subject"];

const VISIBLE_ROWS = 5;

const STATE_TONE = {
	running: "primary",
	queued: "neutral",
	failed: "error",
} satisfies Record<QueueRow["state"], StatusTone>;

export function EnrichmentQueue() {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const [open, setOpen] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [limit, setLimit] = useState(ENRICHMENT_PAGE);

	const queue = useQuery({
		...trpc.enrichment.queue.queryOptions({ limit }),
		placeholderData: keepPreviousData,
		refetchInterval: (query) =>
			(query.state.data?.total ?? 0) > 0
				? ENRICHMENT_POLL_MS
				: ENRICHMENT_IDLE_POLL_MS,
	});

	const rows = queue.data?.rows ?? [];
	const total = queue.data?.total ?? 0;
	const scheduled = queue.data?.scheduled ?? [];
	const scheduledTotal = queue.data?.scheduledTotal ?? 0;
	const visible = expanded ? rows : rows.slice(0, VISIBLE_ROWS);
	const footer = queueFooter({
		total,
		fetched: rows.length,
		shown: visible.length,
		limit,
	});

	const close = () => {
		setOpen(false);
		setExpanded(false);
		setLimit(ENRICHMENT_PAGE);
	};

	const openSubject = (subject: QueueSubject) => {
		close();
		openRecord({ kind: subject.kind, id: subject.id });
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => (next ? setOpen(true) : close())}
		>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm">
					<IndicatorDot
						tone={total > 0 ? "primary" : "neutral"}
						aria-hidden="true"
					/>
					{total > 0 ? `Enriching ${total}` : "Enriching"}
				</Button>
			</PopoverTrigger>

			<PopoverContent align="end" size="panel">
				<div className="flex items-center justify-between border-b px-4 py-3">
					<span className="font-semibold text-popover-foreground text-sm">
						Enriching now
					</span>
					<span className="font-mono text-muted-foreground text-xs">
						{total}
					</span>
				</div>

				{visible.length === 0 ? (
					<div className="flex flex-col gap-1 px-6 py-8 text-center">
						<span className="font-medium text-popover-foreground text-sm">
							Nothing right now
						</span>
						<span className="text-muted-foreground text-xs">
							New companies and contacts show up here while your agents look
							them up.
						</span>
					</div>
				) : (
					<QueueRows
						rows={visible}
						scroll={expanded}
						onOpen={(row) => openSubject(row.subject)}
					/>
				)}

				{footer.more > 0 ? (
					<div className="flex items-center justify-between px-4 py-3 text-xs">
						<span className="text-muted-foreground">
							{footer.more} more queued
						</span>
						{footer.action === "show-all" ? (
							<button
								type="button"
								className="cursor-pointer text-primary"
								onClick={() => setExpanded(true)}
							>
								Show all
							</button>
						) : null}
						{footer.action === "load-more" ? (
							<button
								type="button"
								className="cursor-pointer text-primary"
								onClick={() =>
									setLimit((current) =>
										Math.min(current + ENRICHMENT_PAGE, ENRICHMENT_PAGE_MAX),
									)
								}
							>
								Load more
							</button>
						) : null}
					</div>
				) : null}

				{scheduledTotal > 0 ? (
					<ScheduledSection
						rows={scheduled}
						total={scheduledTotal}
						onOpen={(row) => openSubject(row.subject)}
					/>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

function QueueRows({
	rows,
	scroll,
	onOpen,
}: {
	rows: QueueRow[];
	scroll: boolean;
	onOpen: (row: QueueRow) => void;
}) {
	const now = useSeconds();

	return (
		<div className={cn(scroll && "max-h-80 overflow-y-auto")}>
			{rows.map((row) => (
				<QueueRowButton
					key={row.id}
					row={row}
					now={now}
					onOpen={() => onOpen(row)}
				/>
			))}
		</div>
	);
}

function QueueRowButton({
	row,
	now,
	onOpen,
}: {
	row: QueueRow;
	now: number;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="group flex w-full cursor-pointer items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted"
		>
			<SubjectFace subject={row.subject} />

			<span className="flex min-w-0 flex-1 flex-col gap-px">
				<span className="truncate font-medium text-popover-foreground text-sm">
					{row.subject.name}
				</span>
				<span
					className={cn(
						"truncate text-xs",
						row.state === "failed"
							? "text-destructive"
							: "text-muted-foreground",
					)}
				>
					{row.line}
				</span>
			</span>

			<span className="flex w-13 shrink-0 items-center justify-end gap-2">
				<span className="font-mono text-muted-foreground text-xs group-hover:hidden">
					{elapsedLabel(row.state, row.startedAt, now)}
				</span>
				<ChevronRight
					className="hidden size-3.5 text-muted-foreground group-hover:block"
					aria-hidden="true"
				/>
				<IndicatorDot tone={STATE_TONE[row.state]} aria-hidden="true" />
			</span>
		</button>
	);
}

function SubjectFace({ subject }: { subject: QueueSubject }) {
	if (subject.kind === "contact") {
		return (
			<PersonAvatar
				size="sm"
				src={subject.imageUrl}
				name={subject.name}
				email={subject.email}
			/>
		);
	}

	return (
		<EntityLogo
			src={subject.logoUrl}
			darkSrc={subject.logoDarkUrl}
			tone={entityTone(subject.logoTone)}
			name={subject.name}
		/>
	);
}

function ScheduledSection({
	rows,
	total,
	onOpen,
}: {
	rows: ScheduledRow[];
	total: number;
	onOpen: (row: ScheduledRow) => void;
}) {
	const [shown, setShown] = useState(false);

	return (
		<Collapsible className="border-t" open={shown} onOpenChange={setShown}>
			<CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-xs hover:bg-muted">
				<span className="text-muted-foreground">
					{total === 1
						? "1 record is booked for a later look"
						: `${total} records are booked for a later look`}
				</span>
				<span className="text-primary">{shown ? "Hide" : "Show"}</span>
			</CollapsibleTrigger>

			<CollapsibleContent className="max-h-60 overflow-y-auto border-t">
				{rows.map((row) => (
					<button
						key={row.id}
						type="button"
						onClick={() => onOpen(row)}
						className="flex w-full cursor-pointer items-center gap-3 border-b px-4 py-2.5 text-left last:border-b-0 hover:bg-muted"
					>
						<SubjectFace subject={row.subject} />
						<span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
							{row.subject.name}
						</span>
						<span className="shrink-0 text-muted-foreground text-xs">
							{row.due}
						</span>
					</button>
				))}

				{total > rows.length ? (
					<div className="px-4 py-3 text-muted-foreground text-xs">
						{total - rows.length} more are booked but not listed here
					</div>
				) : null}
			</CollapsibleContent>
		</Collapsible>
	);
}

function entityTone(tone: string | null): EntityLogoTone | null {
	if (tone === "dark" || tone === "light" || tone === "opaque") return tone;

	return null;
}
