import { expect, test } from "bun:test";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "../src/components/data-table";
import { TooltipProvider } from "../src/components/tooltip";
import type { TableQueryState } from "../src/lib/table-query";

const query: TableQueryState = {
	sort: "name",
	dir: "asc",
	page: 1,
	pageSize: 25,
	tab: "all",
	filters: {},
	toggleSort: () => undefined,
	setSort: () => undefined,
	setDir: () => undefined,
	setPage: async () => undefined,
	setTab: () => undefined,
	setFilter: () => undefined,
};

test("empty archived lists keep status, filters, sort, and column controls", () => {
	const html = renderToStaticMarkup(
		<TooltipProvider>
			<NuqsTestingAdapter searchParams="?archived=true">
				<DataTable
					label="Deals"
					query={query}
					columns={[
						{
							id: "name",
							header: "Name",
							sortable: true,
							cell: (row: { id: string; name: string }) => row.name,
						},
					]}
					getRowId={(row) => row.id}
					rows={[]}
					total={0}
					tabs={{
						id: "status",
						label: "Status",
						options: [
							{ value: "open", label: "Open" },
							{ value: "closed", label: "Closed" },
						],
					}}
					facets={[
						{
							id: "stage",
							label: "Stage",
							options: [],
						},
					]}
					actions={
						<button type="button" aria-pressed>
							Archived
						</button>
					}
				/>
			</NuqsTestingAdapter>
		</TooltipProvider>,
	);
	for (const label of ["Status", "Filters", "Sort", "Columns", "Archived"]) {
		expect(html).toContain(label);
	}
	expect(html).toContain('aria-pressed="true"');
	expect(html).toMatch(
		/<button(?=[^>]*disabled="")[^>]*>(?:(?!<\/button>).)*Filters/s,
	);
});
