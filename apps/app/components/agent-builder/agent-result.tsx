import { Skeleton } from "@crm/ui/components/skeleton";
import type { EveToolOutput } from "@crm/validation/eve-tool";
import type { ReactNode } from "react";
import { anchorResults } from "@/lib/agent-results";
import {
	type DealListResult,
	dealListResultOf,
	groupDealListPages,
	type TranscriptItem,
} from "@/lib/agent-transcript";
import {
	providerCardOf,
	providerForTool,
	type SupportedResultProvider,
} from "@/lib/connection-result";
import { DealListResultTable } from "./deal-list-result";
import { ProviderConnectionResult } from "./provider-connection-result";

type ResultEntry = {
	anchor: (items: readonly TranscriptItem[]) => Map<string, ReactNode[]>;
	ownsResponse: boolean;
	skeleton: ReactNode;
};

function defineResult<T>({
	tool,
	validate,
	group,
	render,
	skeleton,
	ownsResponse = false,
}: {
	tool: string;
	validate: (output: EveToolOutput) => T | null;
	group?: (
		results: readonly { itemId: string; value: T }[],
	) => readonly { itemId: string; value: T }[];
	render: (result: T, key: string) => ReactNode;
	skeleton: ReactNode;
	ownsResponse?: boolean;
}): ResultEntry {
	return {
		ownsResponse,
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

const REGISTRY = new Map<string, ResultEntry>([
	[
		"list_deals",
		defineResult<DealListResult>({
			tool: "list_deals",
			validate: dealListResultOf,
			group: groupDealListPages,
			render: (result, key) => (
				<DealListResultTable key={key} result={result} />
			),
			skeleton: listSkeleton,
		}),
	],
]);

export function hasAgentResult(
	tool: string,
	providers: readonly SupportedResultProvider[] = [],
): boolean {
	return REGISTRY.has(tool) || providerForTool(tool, providers) !== null;
}

export function agentResultOwnsResponse(
	tool: string,
	providers: readonly SupportedResultProvider[] = [],
): boolean {
	const registered = REGISTRY.get(tool);
	if (registered) return registered.ownsResponse;
	return providerForTool(tool, providers) !== null;
}

export function agentResultSkeleton(
	tool: string,
	providers: readonly SupportedResultProvider[] = [],
): ReactNode {
	const registered = REGISTRY.get(tool);
	if (registered) return registered.skeleton;
	return providerForTool(tool, providers) ? listSkeleton : null;
}

export function agentResultsByItem(
	items: readonly TranscriptItem[],
	providers: readonly SupportedResultProvider[] = [],
): Map<string, ReactNode[]> {
	const rendered = new Map<string, ReactNode[]>();

	for (const entry of REGISTRY.values()) {
		for (const [itemId, nodes] of entry.anchor(items)) {
			const bucket = rendered.get(itemId);
			if (bucket) bucket.push(...nodes);
			else rendered.set(itemId, nodes);
		}
	}

	for (const item of items) {
		if (item.kind !== "did" || item.pending) continue;
		const provider = providerForTool(item.tool, providers);
		if (!provider) continue;
		const result = providerCardOf({
			provider,
			tool: item.tool,
			output: item.output,
		});
		if (!result) continue;
		const node = (
			<ProviderConnectionResult
				key={`${item.tool}-${item.id}`}
				result={result}
			/>
		);
		const bucket = rendered.get(item.id);
		if (bucket) bucket.push(node);
		else rendered.set(item.id, [node]);
	}

	return rendered;
}
