"use client";

import {
	SimpleTable,
	type SimpleTableColumn,
} from "@crm/ui/components/simple-table";
import type { ReactNode } from "react";

export type CardTableColumn = SimpleTableColumn;

export function CardTable({
	columns,
	children,
}: {
	columns: CardTableColumn[];
	children: ReactNode;
}) {
	return (
		<SimpleTable
			className="min-w-[48rem] table-fixed [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4"
			columns={columns}
		>
			{children}
		</SimpleTable>
	);
}

export function CardTableEmpty({ children }: { children: ReactNode }) {
	return (
		<p className="border-t py-6 text-center text-muted-foreground text-sm">
			{children}
		</p>
	);
}
