"use client";

import { Button } from "@crm/ui/components/button";
import { SkeletonLine } from "@crm/ui/components/skeleton-lines";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { type ReactNode, useCallback, useRef } from "react";

const numberFormat = new Intl.NumberFormat();

export function TablePagination({
	page,
	totalPages,
	pageSize,
	total,
	onPageChange,
	loading = false,
	meta,
}: {
	page: number;
	totalPages: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	loading?: boolean;
	meta?: ReactNode;
}) {
	const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const rangeEnd = Math.min(page * pageSize, total);
	const previous = useRef<HTMLButtonElement>(null);
	const next = useRef<HTMLButtonElement>(null);
	const returnFocus = useRef<{
		page: number;
		control: "previous" | "next";
	} | null>(null);
	const restoreFocus = useCallback(
		(node: HTMLDivElement | null) => {
			if (!node || returnFocus.current?.page !== page) return;
			const target =
				returnFocus.current.control === "previous" ? previous : next;
			const source =
				returnFocus.current.control === "previous" ? next : previous;
			returnFocus.current = null;
			if (
				(document.activeElement === source.current ||
					document.activeElement === document.body) &&
				!target.current?.disabled
			)
				target.current?.focus();
		},
		[page],
	);

	return (
		<div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
			<span className="flex items-center gap-2 text-13 text-muted-foreground tabular-nums">
				{loading && total === 0 ? (
					<SkeletonLine width="48" />
				) : (
					(meta ??
					(total === 0
						? "No results"
						: `Showing ${numberFormat.format(rangeStart)}–${numberFormat.format(
								rangeEnd,
							)} of ${numberFormat.format(total)}`))
				)}
			</span>
			{totalPages > 1 && (
				<div ref={restoreFocus} className="flex items-center gap-2">
					<Button
						ref={previous}
						variant="ghost"
						size="sm"
						disabled={page <= 1}
						onClick={(event) => {
							const targetPage = Math.max(1, page - 1);
							returnFocus.current =
								targetPage === 1 &&
								document.activeElement === event.currentTarget
									? { page: targetPage, control: "next" }
									: null;
							onPageChange(targetPage);
						}}
					>
						<ChevronLeftIcon data-icon="inline-start" />
						Previous
					</Button>
					<span className="text-muted-foreground text-sm tabular-nums">
						{page} / {totalPages}
					</span>
					<Button
						ref={next}
						variant="ghost"
						size="sm"
						disabled={page >= totalPages}
						onClick={(event) => {
							const targetPage = page + 1;
							returnFocus.current =
								targetPage >= totalPages &&
								document.activeElement === event.currentTarget
									? { page: targetPage, control: "previous" }
									: null;
							onPageChange(targetPage);
						}}
					>
						Next
						<ChevronRightIcon data-icon="inline-end" />
					</Button>
				</div>
			)}
		</div>
	);
}
