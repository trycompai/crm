import {
	ArrowUpDownIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	Columns3Icon,
	PlusIcon,
	SearchIcon,
} from "lucide-react";
import Image from "next/image";
import { COMPANY_COLUMNS, MOCK_COMPANIES } from "./companies";
import { CompanyMark } from "./company-mark";

const FACETS = ["Owner", "Industry", "Enrichment"];

export function CompaniesPage() {
	return (
		<div className="flex min-w-0 grow flex-col overflow-clip p-6">
			<div className="mx-auto flex w-full min-w-0 max-w-[1280px] grow flex-col gap-6">
				<PageHeader />

				<div className="flex min-h-0 grow flex-col gap-3">
					<Toolbar />
					<CompaniesTable />
					<Pagination />
				</div>
			</div>
		</div>
	);
}

/**
 * What the list looks like on a phone: no columns, no facet bar — the name and
 * the domain, which is all a narrow row has space to say.
 */
export function CompaniesList() {
	return (
		<div className="flex min-h-0 min-w-0 grow flex-col gap-3 p-4">
			<p className="font-medium text-xl/[120%] tracking-[-0.5px]">Companies</p>

			<div className="flex h-8 shrink-0 items-center rounded-md border border-border bg-muted px-2">
				<SearchIcon size={14} className="shrink-0 text-muted-foreground" />
				<span className="truncate pl-1.5 text-muted-foreground text-xs">
					Search companies…
				</span>
			</div>

			<div className="flex flex-col">
				{MOCK_COMPANIES.slice(0, 6).map((company) => (
					<div
						key={company.name}
						className="flex h-12 shrink-0 items-center gap-2.5 border-border border-b"
					>
						<CompanyMark company={company} size={20} glyph={12} />
						<span className="min-w-0 grow truncate font-medium text-xs">
							{company.name}
						</span>
						<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
							{company.domain}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function PageHeader() {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
			<p className="col-start-1 row-start-1 self-center font-medium text-3xl/[120%] tracking-[-0.75px]">
				Companies
			</p>
			<p className="col-start-1 -col-end-1 row-start-2 text-muted-foreground text-sm/[142%]">
				Every account in the pipeline.
			</p>
			<span className="col-start-2 row-start-1 flex h-8 shrink-0 items-center justify-self-end rounded-md bg-primary pr-2.5 pl-2 text-primary-foreground shadow-2xs">
				<PlusIcon size={16} />
				<span className="pl-1.5 font-medium text-xs/[133%]">New company</span>
			</span>
		</div>
	);
}

function Toolbar() {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<div className="flex h-8 w-64 shrink-0 items-center rounded-md border border-border bg-muted pl-2">
				<SearchIcon size={16} className="shrink-0 text-muted-foreground" />
				<span className="truncate pl-1.5 text-muted-foreground text-xs">
					Search companies by name or domain…
				</span>
			</div>

			<div className="ml-auto flex flex-wrap items-center gap-2">
				{FACETS.map((facet) => (
					<span
						key={facet}
						className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-muted pr-1.5 pl-2.5 font-medium text-xs/[133%] shadow-2xs"
					>
						{facet}
						<ChevronDownIcon size={14} className="shrink-0 opacity-60" />
					</span>
				))}
				<span className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-muted pr-2.5 pl-1.5 font-medium text-xs/[133%] shadow-2xs">
					<ArrowUpDownIcon size={14} className="shrink-0" />
					Sort
				</span>
				<span className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-muted pr-2.5 pl-1.5 font-medium text-xs/[133%] shadow-2xs">
					<Columns3Icon size={14} className="shrink-0" />
					Columns
					<span className="opacity-60">(7)</span>
				</span>
			</div>
		</div>
	);
}

function CompaniesTable() {
	return (
		<div className="min-h-0 w-full grow overflow-clip rounded-lg border border-border bg-card">
			<table className="w-full table-fixed border-collapse">
				<thead className="bg-muted">
					<tr>
						{COMPANY_COLUMNS.map((column, index) => (
							<th
								key={column.label}
								style={{ width: column.width }}
								className={`h-11 overflow-clip pr-3 text-left font-normal ${index === 0 ? "pl-4" : "pl-3"}`}
							>
								<span className="-ml-2 inline-flex h-6 items-center gap-1 rounded-sm px-2 text-muted-foreground text-xs/[133%]">
									{column.label}
									<ArrowUpDownIcon size={12} className="shrink-0 opacity-40" />
								</span>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{MOCK_COMPANIES.map((company) => (
						<tr key={company.name} className="border-border border-b">
							<td className="overflow-clip p-3">
								<span className="flex items-center gap-2.5">
									<CompanyMark company={company} size={20} glyph={12} />
									<span className="line-clamp-1 font-medium text-xs/[133%]">
										{company.name}
									</span>
								</span>
							</td>
							<td className="overflow-clip p-3">
								<span className="line-clamp-1 text-muted-foreground text-xs/[133%]">
									{company.domain}
								</span>
							</td>
							<td className="overflow-clip p-3">
								<span className="line-clamp-1 text-xs/[133%]">
									{company.industry}
								</span>
							</td>
							<td className="overflow-clip p-3">
								{company.owner ? (
									<span className="flex items-center gap-2">
										<Image
											src={company.owner.avatar}
											alt=""
											width={24}
											height={24}
											className="size-6 shrink-0 rounded-full object-cover"
										/>
										<span className="line-clamp-1 text-xs/[133%]">
											{company.owner.name}
										</span>
									</span>
								) : null}
							</td>
							<td className="overflow-clip p-3 text-right text-xs/[133%] tabular-nums">
								{company.contacts}
							</td>
							<td className="overflow-clip p-3 text-right text-xs/[133%] tabular-nums">
								{company.deals}
							</td>
							<td className="overflow-clip py-3 pr-4 pl-3 text-right text-muted-foreground text-xs/[133%]">
								{company.lastActivity}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function Pagination() {
	return (
		<div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
			<span className="text-muted-foreground text-xs/[133%] tabular-nums">
				Showing 1–25 of 48
			</span>

			<div className="flex items-center gap-2">
				<span className="flex h-7 shrink-0 items-center gap-1 rounded-md pr-2.5 pl-1.5 font-medium text-xs/[133%] opacity-50">
					<ChevronLeftIcon size={14} className="shrink-0" />
					Previous
				</span>
				<span className="text-muted-foreground text-xs/[133%] tabular-nums">
					1 / 2
				</span>
				<span className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-foreground pr-1.5 pl-2.5 font-medium text-background text-xs/[133%] shadow-2xs">
					Next
					<ChevronRightIcon size={14} className="shrink-0" />
				</span>
			</div>
		</div>
	);
}
