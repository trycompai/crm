"use client";

import type { DataTableColumn } from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { formatDay } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type Owner, OwnerCell } from "@/components/crm/owner-cell";
import { useTRPC } from "@/lib/trpc/client";
import type { FieldEntity } from "./fields-entity";

type WithFields = { fields: Record<string, string | number | boolean | null> };

function render(
	type: string,
	value: string | number | boolean | null,
	users: Map<string, Owner>,
) {
	if (value === null || value === "") return <EmptyCellValue />;

	if (type === "CHECKBOX") return value === true ? "Yes" : "No";
	if (type === "DATE") return formatDay(String(value));
	if (type === "USER") {
		const user = users.get(String(value));
		return user ? <OwnerCell owner={user} /> : <EmptyCellValue />;
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
	const users = useQuery(trpc.users.list.queryOptions());

	const fields = query.data;
	const members = users.data;

	const byId = useMemo(
		() => new Map((members ?? []).map((user) => [user.id, user])),
		[members],
	);

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
						{render(field.type, row.fields[field.key] ?? null, byId)}
					</span>
				),
			}));
	}, [fields, byId]);
}
