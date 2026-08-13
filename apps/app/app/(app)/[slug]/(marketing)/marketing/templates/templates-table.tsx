"use client";

import { DataTable, type DataTableColumn } from "@crm/ui/components/data-table";
import { EmailGlyph } from "@crm/ui/components/email-glyph";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeDate } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { templatesSearchParams } from "./templates-search-params";

type TemplateRow = RouterOutputs["marketingTemplates"]["list"]["rows"][number];

function Checks({ row }: { row: TemplateRow }) {
	if (row.kind !== "TEMPLATE") return <EmptyCellValue />;

	if (row.errors > 0) {
		return (
			<span className="text-destructive">
				{row.errors} error{row.errors === 1 ? "" : "s"}
			</span>
		);
	}

	if (row.warnings > 0) {
		return (
			<span className="text-muted-foreground">
				{row.warnings} warning{row.warnings === 1 ? "" : "s"}
			</span>
		);
	}

	return <span className="text-muted-foreground">Clean</span>;
}

const COLUMNS: DataTableColumn<TemplateRow>[] = [
	{
		id: "name",
		header: "Template",
		sortable: true,
		hideable: false,
		width: "w-[30%]",
		cell: (row) => (
			<span className="flex min-w-0 items-center gap-2.5">
				<EmailGlyph glyph={row.glyph} />
				<span className="truncate font-medium">{row.name}</span>
			</span>
		),
	},
	{
		id: "kind",
		header: "Kind",
		width: "w-[10%]",
		hideBelow: "md",
		cell: (row) => (
			<span className="truncate text-muted-foreground">
				{row.kind === "HEADER"
					? "Header"
					: row.kind === "FOOTER"
						? "Footer"
						: "Template"}
			</span>
		),
	},
	{
		id: "subject",
		header: "Subject",
		width: "w-[26%]",
		hideBelow: "md",
		cell: (row) =>
			row.subject ? (
				<span className="truncate text-muted-foreground">{row.subject}</span>
			) : (
				<EmptyCellValue />
			),
	},
	{
		id: "usedBy",
		header: "Used by",
		width: "w-[14%]",
		cell: (row) => (
			<span className="truncate text-muted-foreground">
				{row.usedBy === 0
					? "Never used"
					: row.kind === "TEMPLATE"
						? `${row.usedBy} campaign${row.usedBy === 1 ? "" : "s"}`
						: `${row.usedBy} template${row.usedBy === 1 ? "" : "s"}`}
			</span>
		),
	},
	{
		id: "updatedAt",
		header: "Last edited",
		sortable: true,
		width: "w-[14%]",
		hideBelow: "sm",
		cell: (row) => (
			<span className="truncate text-muted-foreground">
				<LocalRelativeDate date={row.updatedAt} />
			</span>
		),
	},
	{
		id: "checks",
		header: "Checks",
		width: "w-[10%]",
		hideBelow: "lg",
		cell: (row) => <Checks row={row} />,
	},
];

export function TemplatesTable() {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const { query, input } = useTableQuery(templatesSearchParams);

	const templates = useQuery({
		...trpc.marketingTemplates.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder="Search templates…" />}
			columns={COLUMNS}
			rows={templates.data?.rows ?? []}
			total={templates.data?.total ?? 0}
			getRowId={(row) => row.id}
			loading={templates.isPending}
			onRowClick={(row) =>
				router.push(workspaceUrl(`/marketing/templates/${row.id}`))
			}
			empty="No templates yet. A template is a saved email you can start a campaign from."
		/>
	);
}
