"use client";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import { useState } from "react";
import type { RouterOutputs } from "@/lib/trpc/types";
import { AgentActivity, AgentRuns } from "./agent-history";

type Runs = RouterOutputs["agents"]["history"];
type Activity = RouterOutputs["agents"]["activity"];

const VIEWS = [
	{ id: "runs", label: "Runs" },
	{ id: "activity", label: "Activity" },
] as const;

type View = (typeof VIEWS)[number]["id"];

export function AgentRunsDrawer({
	activity,
	cancelling,
	onCancel,
	onOpenChange,
	onRetry,
	open,
	retryingRunId,
	runs,
}: {
	activity: Activity;
	agentId: string;
	cancelling: boolean;
	onCancel: (runId: string) => void;
	onOpenChange: (open: boolean) => void;
	onRetry: (runId: string) => void;
	open: boolean;
	retryingRunId?: string;
	runs: Runs;
}) {
	const [view, setView] = useState<View>("runs");
	const [wasOpen, setWasOpen] = useState(open);

	if (wasOpen !== open) {
		setWasOpen(open);
		if (open) setView("runs");
	}

	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent className="flex flex-col gap-0 p-0" side="right" size="xl">
				<SheetHeader className="gap-1 border-b px-5 py-4">
					<SheetTitle>History</SheetTitle>
					<SheetDescription>
						Every run and every change, newest first.
					</SheetDescription>
				</SheetHeader>

				<div className="flex h-9 shrink-0 items-end gap-5 border-b px-5">
					{VIEWS.map((entry) => (
						<button
							className={`-mb-px h-9 border-b-2 text-sm ${
								view === entry.id
									? "border-foreground font-medium"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
							key={entry.id}
							onClick={() => setView(entry.id)}
							type="button"
						>
							{entry.label}{" "}
							<span className="font-mono text-muted-foreground">
								{entry.id === "runs" ? runs.length : activity.length}
							</span>
						</button>
					))}
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
					{view === "runs" ? (
						<AgentRuns
							cancelling={cancelling}
							onCancel={onCancel}
							onRetry={onRetry}
							retryingRunId={retryingRunId}
							runs={runs}
						/>
					) : (
						<AgentActivity activity={activity} />
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
