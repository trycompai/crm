"use client";

import type { DataTableColumn } from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { formatDay } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTRPC } from "@/lib/trpc/client";
import type { FieldEntity } from "./fields-entity";

type WithFields = { fields: Record<string, string | number | boolean | null> };

function render(
	type: string,
	value: string | number | boolean | null,
	options: { id: string; label: string }[],
) {
	if (value === null || value === "") return <EmptyCellValue />;

	if (type === "CHECKBOX") return value === true ? "Yes" : "No";
	if (type === "DATE") return formatDay(String(value));
	if (type === "SELECT") {
		return (
			options.find((option) => option.id === value)?.label ?? <EmptyCellValue />
		);
	}
	if (type === "NUMBER") {
		return <span className="tabular-nums">{String(value)}</span>;
	}

	return String(value);
}

export function useFieldColumns<Row extends WithFields>(
	entity: FieldEntity,
): DataTableColumn<Row>[] {
	const trpc = useTRPC();
	const query = useQuery(
		trpc.fields.list.queryOptions({ entity, includeArchived: false }),
	);

	const fields = query.data;

	return useMemo(() => {
		if (!fields) return [];

		return fields
			.filter((field) => field.showOnTable)
			.map((field) => ({
				id: `field:${field.key}`,
				header: field.label,
				width: "w-[12%]",
				hideBelow: "lg" as const,
				cell: (row: Row) => (
					<span className="truncate">
						{render(field.type, row.fields[field.key] ?? null, field.options)}
					</span>
				),
			}));
	}, [fields]);
}
