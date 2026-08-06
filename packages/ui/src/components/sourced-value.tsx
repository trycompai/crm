"use client";

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import type * as React from "react";

export const SOURCED_VALUE = "underline decoration-dotted underline-offset-4";

export function SourcedValue({
	children,
	source,
}: {
	children: React.ReactElement;
	source: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent className="block max-w-sm px-3 py-2 text-left">
				{source}
			</TooltipContent>
		</Tooltip>
	);
}

export function Provenance({
	claim,
	reasons,
	observedAt,
	sourceUrl,
}: {
	claim: string;
	reasons: string[];
	observedAt?: React.ReactNode;
	sourceUrl?: string | null;
}) {
	return (
		<span className="flex flex-col gap-1.5">
			<span className="font-medium">{claim}</span>

			{reasons.length > 0 ? (
				<span className="flex flex-col gap-0.5 opacity-80">
					{reasons.map((reason) => (
						<span key={reason}>{reason}</span>
					))}
				</span>
			) : null}

			{observedAt || sourceUrl ? (
				<span className="flex flex-wrap items-center gap-x-2 opacity-60">
					{observedAt ? <span>{observedAt}</span> : null}
					{sourceUrl ? (
						<span className="truncate">{hostOf(sourceUrl)}</span>
					) : null}
				</span>
			) : null}
		</span>
	);
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}
