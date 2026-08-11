"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LocalDateTime, LocalRelativeTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Sequence = RouterOutputs["outreach"]["sequences"][number];

export function SequenceList() {
	const trpc = useTRPC();
	const sequences = useSuspenseQuery(trpc.outreach.sequences.queryOptions());
	const performance = useSuspenseQuery(
		trpc.outreach.performance.queryOptions(),
	);

	return (
		<div className="space-y-6">
			<div className="grid gap-3 sm:grid-cols-3">
				{performance.data.map((row) => (
					<Card key={row.variant}>
						<CardContent className="py-4">
							<div className="flex items-center justify-between gap-3">
								<p className="font-medium text-sm">Variant {row.variant}</p>
								<p className="font-semibold text-lg tabular-nums">
									{row.replyRate === null
										? "—"
										: `${Math.round(row.replyRate * 100)}%`}
								</p>
							</div>
							<p className="text-muted-foreground text-xs">
								{row.sent} sent · {row.replies} replies · {row.assigned}{" "}
								assigned
							</p>
						</CardContent>
					</Card>
				))}
			</div>

			{sequences.data.length > 0 ? (
				<div className="space-y-3">
					{sequences.data.map((sequence) => (
						<SequenceCard key={sequence.sequenceId} sequence={sequence} />
					))}
				</div>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>No sequences prepared</CardTitle>
						<CardDescription>
							Open a promoted prospect with a verified public work route,
							approve the route, then prepare its A/B/C sequence. Nothing sends
							until the three steps are reviewed and explicitly approved.
						</CardDescription>
					</CardHeader>
				</Card>
			)}
		</div>
	);
}

function SequenceCard({ sequence }: { sequence: Sequence }) {
	const openRecord = useOpenRecord();
	const presentation = sequencePresentation(sequence.state);
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{sequence.prospect?.companyName ?? "Unmatched sequence"}
				</CardTitle>
				<CardDescription>
					{[
						sequence.prospect?.namedPerson,
						sequence.prospect?.countryCode,
						sequence.prospect?.routeEmail,
					]
						.filter(Boolean)
						.join(" · ") || "Recipient details unavailable"}
				</CardDescription>
				<div className="flex flex-wrap items-center gap-2">
					<StatusIndicator
						tone={presentation.tone}
						label={presentation.label}
					/>
					{sequence.variant ? (
						<StatusIndicator
							tone="neutral"
							label={`Variant ${sequence.variant}`}
						/>
					) : null}
					{sequence.prospect ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() =>
								openRecord(
									{ kind: "prospect", id: sequence.prospect?.id ?? "" },
									{ tab: "draft" },
								)
							}
						>
							Review & control
						</Button>
					) : null}
				</div>
				{sequence.executionDisabledReason ? (
					<CardDescription>{sequence.executionDisabledReason}</CardDescription>
				) : null}
			</CardHeader>
			<CardContent>
				<div className="divide-y rounded-md border">
					{sequence.steps.map((step) => (
						<div
							key={step.id}
							className="grid gap-1 px-3 py-2 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
						>
							<p className="text-muted-foreground text-xs">
								Step {step.step ?? "—"}
							</p>
							<div className="min-w-0">
								<p className="truncate text-sm">{step.subject}</p>
								<p className="text-muted-foreground text-xs">
									{step.scheduledFor ? (
										<LocalDateTime
											date={step.scheduledFor}
											options={{
												month: "short",
												day: "numeric",
												hour: "numeric",
												minute: "2-digit",
											}}
										/>
									) : (
										"Not scheduled"
									)}
								</p>
								{step.stopReason ? (
									<p className="text-muted-foreground text-xs">
										{step.stopReason}
									</p>
								) : null}
							</div>
							<StatusIndicator
								tone={step.sendError || step.stopReason ? "warning" : "neutral"}
								label={step.status.toLowerCase().replaceAll("_", " ")}
							/>
						</div>
					))}
				</div>
				<p className="mt-2 text-right text-muted-foreground text-xs">
					Updated <LocalRelativeTime date={sequence.updatedAt} />
				</p>
			</CardContent>
		</Card>
	);
}

function sequencePresentation(state: string): {
	label: string;
	tone: StatusTone;
} {
	switch (state) {
		case "REPLIED":
			return { label: "Replied · stopped", tone: "success" };
		case "ACTIVE":
			return { label: "Active", tone: "info" };
		case "APPROVED":
			return { label: "Approved · execution disabled", tone: "warning" };
		case "SENT":
			return { label: "Sent", tone: "neutral" };
		case "STOPPED":
			return { label: "Stopped", tone: "warning" };
		default:
			return { label: "Human review required", tone: "warning" };
	}
}
