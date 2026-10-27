"use client";

import { SettingsCard } from "@crm/ui/components/settings-card";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";

const COLUMNS: SimpleTableColumn[] = [
	{ id: "source", header: "Source" },
	{ id: "medium", header: "Medium", width: "w-32" },
	{ id: "views", header: "Page views", width: "w-28", align: "right" },
	{ id: "contacts", header: "Contacts", width: "w-24", align: "right" },
];

export function TrafficSources() {
	const trpc = useTRPC();
	const sources = useQuery(trpc.tracking.sources.queryOptions());

	if (!sources.data) return null;

	return (
		<SettingsCard
			title="Traffic sources"
			description="Where your visitors come from. Only people who have submitted a form are attributed to a record."
			control={sources.data.length === 0 ? "full" : "table"}
		>
			{sources.data.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No sources yet. They appear once the script records its first page
					view.
				</p>
			) : (
				<SimpleTable columns={COLUMNS}>
					{sources.data.map((row) => (
						<SimpleTableRow key={`${row.source}-${row.medium ?? ""}`}>
							<TableCell className={CELL}>{row.source}</TableCell>
							<TableCell className={`${CELL} text-muted-foreground`}>
								{row.medium ?? ""}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{row.views.toLocaleString()}
							</TableCell>
							<TableCell className={`${CELL} text-right tabular-nums`}>
								{row.contacts.toLocaleString()}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			)}
		</SettingsCard>
	);
}
