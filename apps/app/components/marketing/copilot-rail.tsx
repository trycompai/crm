"use client";

import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { parseAsBoolean, useQueryState } from "nuqs";
import { AgentPanel } from "@/components/crm/agent-panel";
import type { AgentRecord } from "@/lib/agent-record";

export function CopilotRail({
	record,
	onFinish,
}: {
	record: AgentRecord;
	onFinish?: () => void;
}) {
	const [open, setOpen] = useQueryState(
		"copilot",
		parseAsBoolean.withDefault(true),
	);

	if (!open) {
		return (
			<aside className="flex w-11 shrink-0 flex-col items-center border-l py-3">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => void setOpen(true)}
					aria-label="Open the co-pilot"
				>
					<Icon icon={ChevronRight} className="rotate-180" />
				</Button>
			</aside>
		);
	}

	return (
		<aside className="flex w-[440px] shrink-0 flex-col overflow-hidden border-l bg-background">
			<header className="flex h-11 shrink-0 items-center gap-2 border-b pr-3 pl-4">
				<span className="font-medium text-xs">Co-pilot</span>
				<div className="flex-1" />
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1 px-2 font-normal text-muted-foreground text-xs"
					onClick={() => void setOpen(false)}
				>
					Collapse
					<Icon icon={ChevronRight} className="size-3.5" />
				</Button>
			</header>

			<div className="flex min-h-0 flex-1 flex-col">
				<AgentPanel record={record} onFinish={onFinish} />
			</div>
		</aside>
	);
}
