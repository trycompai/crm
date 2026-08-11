"use client";

import Calendar from "@carbon/icons-react/es/Calendar";
import Email from "@carbon/icons-react/es/Email";
import Partnership from "@carbon/icons-react/es/Partnership";
import Task from "@carbon/icons-react/es/Task";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import {
	LocalDateTime,
	LocalDateTimeRange,
	LocalDay,
} from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type AgendaItem = RouterOutputs["calendar"]["agenda"]["items"][number];

export function AgendaView() {
	const trpc = useTRPC();
	const agenda = useSuspenseQuery(trpc.calendar.agenda.queryOptions());
	const groups = useMemo(() => {
		const rows = new Map<string, AgendaItem[]>();
		for (const item of agenda.data.items) {
			const day = item.startsAt.slice(0, 10);
			const items = rows.get(day) ?? [];
			items.push(item);
			rows.set(day, items);
		}
		return [...rows.entries()];
	}, [agenda.data.items]);

	return (
		<div className="space-y-6">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<AgendaStat
					icon={Calendar}
					label="Meetings"
					value={agenda.data.counts.meetings}
				/>
				<AgendaStat
					icon={Task}
					label="Follow-ups"
					value={agenda.data.counts.tasks}
				/>
				<AgendaStat
					icon={Email}
					label="Outreach steps"
					value={agenda.data.counts.outreach}
				/>
				<AgendaStat
					icon={Partnership}
					label="Close targets"
					value={agenda.data.counts.deals}
				/>
			</div>

			{groups.length > 0 ? (
				<div className="space-y-5">
					{groups.map(([day, items]) => (
						<section key={day} className="space-y-2">
							<h2 className="font-medium text-sm">
								<LocalDay date={day} />
							</h2>
							<div className="overflow-hidden rounded-lg border bg-card">
								{items.map((item) => (
									<AgendaRow key={item.id} item={item} />
								))}
							</div>
						</section>
					))}
				</div>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>No scheduled revenue work</CardTitle>
						<CardDescription>
							Connect Google Calendar, add follow-up dates to CRM activities or
							approve an outreach sequence to populate this view.
						</CardDescription>
					</CardHeader>
				</Card>
			)}
		</div>
	);
}

function AgendaStat({
	icon,
	label,
	value,
}: {
	icon: typeof Calendar;
	label: string;
	value: number;
}) {
	return (
		<Card>
			<CardContent className="flex items-center gap-3 py-4">
				<div className="rounded-md bg-muted p-2 text-muted-foreground">
					<Icon icon={icon} />
				</div>
				<div>
					<p className="font-semibold text-xl tabular-nums">{value}</p>
					<p className="text-muted-foreground text-xs">{label}</p>
				</div>
			</CardContent>
		</Card>
	);
}

function AgendaRow({ item }: { item: AgendaItem }) {
	const openRecord = useOpenRecord();
	const target = item.prospect
		? { kind: "prospect" as const, id: item.prospect.id, tab: "draft" }
		: item.deal
			? { kind: "deal" as const, id: item.deal.id, tab: "overview" }
			: item.contact
				? { kind: "contact" as const, id: item.contact.id, tab: "activity" }
				: item.company?.id
					? { kind: "company" as const, id: item.company.id, tab: "activity" }
					: null;
	const person = item.contact
		? [item.contact.firstName, item.contact.lastName].filter(Boolean).join(" ")
		: item.prospect?.namedPerson;

	return (
		<div className="flex min-w-0 items-center gap-3 border-b px-3 py-3 last:border-b-0">
			<div className="w-24 shrink-0 text-muted-foreground text-xs">
				{item.isAllDay ? (
					"All day"
				) : item.endsAt ? (
					<LocalDateTimeRange
						start={item.startsAt}
						end={item.endsAt}
						options={{ hour: "numeric", minute: "2-digit" }}
					/>
				) : (
					<LocalDateTime
						date={item.startsAt}
						options={{ hour: "numeric", minute: "2-digit" }}
					/>
				)}
			</div>
			<button
				type="button"
				disabled={!target}
				className="min-w-0 flex-1 text-left disabled:cursor-default"
				onClick={() =>
					target &&
					openRecord({ kind: target.kind, id: target.id }, { tab: target.tab })
				}
			>
				<p className="truncate font-medium text-sm">{item.title}</p>
				<p className="truncate text-muted-foreground text-xs">
					{[item.company?.name, person, item.location]
						.filter(Boolean)
						.join(" · ") || "Unmatched calendar item"}
				</p>
				{item.executionDisabledReason ? (
					<p className="truncate text-muted-foreground text-xs">
						{item.executionDisabledReason}
					</p>
				) : null}
			</button>
			<StatusIndicator
				tone={
					item.kind === "OUTREACH" && item.executionDisabled
						? "warning"
						: item.kind === "OUTREACH"
							? "info"
							: "neutral"
				}
				label={item.status}
			/>
			{item.conferenceUrl ? (
				<Button asChild size="xs" variant="outline">
					<a
						href={item.conferenceUrl}
						target="_blank"
						rel="noreferrer noopener"
					>
						Join
					</a>
				</Button>
			) : null}
		</div>
	);
}
