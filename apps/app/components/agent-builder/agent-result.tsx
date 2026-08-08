import { Skeleton } from "@crm/ui/components/skeleton";
import type { ReactNode } from "react";
import { anchorResults } from "@/lib/agent-results";
import {
	type DealListResult,
	dealListResultOf,
	groupDealListPages,
	type TranscriptItem,
} from "@/lib/agent-transcript";
import { DealListResultTable } from "./deal-list-result";

type ResultEntry = {
	anchor: (items: readonly TranscriptItem[]) => Map<string, ReactNode[]>;
	skeleton: ReactNode;
};

function defineResult<T>({
	tool,
	validate,
	group,
	render,
	skeleton,
}: {
	tool: string;
	validate: (output: unknown) => T | null;
	group?: (
		results: readonly { itemId: string; value: T }[],
	) => readonly { itemId: string; value: T }[];
	render: (result: T, key: string) => ReactNode;
	skeleton: ReactNode;
}): ResultEntry {
	return {
		skeleton,
		anchor: (items) => {
			const anchored = anchorResults({ items, tool, validate, group });
			const rendered = new Map<string, ReactNode[]>();

			for (const [itemId, values] of anchored) {
				rendered.set(
					itemId,
					values.map((value, index) =>
						render(value, `${tool}-${itemId}-${index}`),
					),
				);
			}

			return rendered;
		},
	};
}

const listSkeleton = (
	<div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
		<Skeleton className="h-4 w-40" />
		<Skeleton className="h-4 w-full" />
		<Skeleton className="h-4 w-full" />
		<Skeleton className="h-4 w-2/3" />
	</div>
);

const REGISTRY: Record<string, ResultEntry> = {
	list_deals: defineResult<DealListResult>({
		tool: "list_deals",
		validate: dealListResultOf,
		group: groupDealListPages,
		render: (result, key) => <DealListResultTable key={key} result={result} />,
		skeleton: listSkeleton,
	}),
};

export function hasAgentResult(tool: string): boolean {
	return tool in REGISTRY;
}

export function agentResultSkeleton(tool: string): ReactNode {
	return REGISTRY[tool]?.skeleton ?? null;
}

export function agentResultsByItem(
	items: readonly TranscriptItem[],
): Map<string, ReactNode[]> {
	const rendered = new Map<string, ReactNode[]>();

	for (const entry of Object.values(REGISTRY)) {
		for (const [itemId, nodes] of entry.anchor(items)) {
			const bucket = rendered.get(itemId);
			if (bucket) bucket.push(...nodes);
			else rendered.set(itemId, nodes);
		}
	}

	return rendered;
}
