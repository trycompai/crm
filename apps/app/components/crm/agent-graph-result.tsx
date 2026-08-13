"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Warning from "@carbon/icons-react/es/Warning";
import { Icon } from "@crm/ui/components/icon";
import type { GraphWriteSummary } from "@/lib/agent-graph-result";

function Figure({ value, label }: { value: number; label: string }) {
	return (
		<div className="flex flex-1 flex-col gap-0.5 border-r px-3 py-2.5 last:border-r-0">
			<span className="font-medium text-lg tabular-nums">
				{value.toLocaleString()}
			</span>
			<span className="text-muted-foreground text-xs">{label}</span>
		</div>
	);
}

export function AgentGraphResult({ summary }: { summary: GraphWriteSummary }) {
	const warned = summary.warning !== null;

	return (
		<div className="w-full max-w-sm overflow-clip rounded-lg border">
			<div className="border-b bg-muted px-3 py-2">
				<span className="font-medium text-xs">Flow written</span>
			</div>

			<div className="flex">
				<Figure value={summary.nodes} label="Steps" />
				<Figure value={summary.edges} label="Connections" />
			</div>

			<p className="border-t px-3 py-2 text-muted-foreground text-xs">
				{summary.breakdown
					.map((part) => `${part.count} ${part.label}`)
					.join(" · ")}
			</p>

			<div className="flex items-start gap-1.5 border-t px-3 py-2">
				<Icon
					icon={warned ? Warning : Checkmark}
					className={
						warned
							? "mt-0.5 size-3 shrink-0 text-warning"
							: "mt-0.5 size-3 shrink-0 text-success"
					}
				/>
				<span className="text-muted-foreground text-xs">
					{summary.warning ?? "Every email passed the linter"}
				</span>
			</div>
		</div>
	);
}
