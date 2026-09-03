"use client";

import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Input } from "@crm/ui/components/input";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { edgarCompanySearch } from "@crm/validation/edgar";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { type FormEvent, useState } from "react";
import { readEdgar } from "./edgar-client";
import { SecCompany } from "./sec-company";

const SEARCH_LIMIT = 10;

export function SecResearch({ configured }: { configured: boolean }) {
	const [q, setQ] = useQueryState("q", { defaultValue: "" });
	const [cik, setCik] = useQueryState("cik", { defaultValue: "" });
	const [draft, setDraft] = useState(q);

	const search = useQuery({
		queryKey: ["edgar", "search", q],
		queryFn: () =>
			readEdgar(
				"companies/search",
				{ q, limit: SEARCH_LIMIT },
				edgarCompanySearch,
			),
		enabled: configured && q.trim().length > 0,
		staleTime: 5 * 60_000,
	});

	if (!configured) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>The SEC EDGAR service is not configured</EmptyTitle>
					<EmptyDescription>
						Set EDGAR_URL and EDGAR_SECRET to a running services/edgar and
						restart the app. docs/setup.md and services/edgar/README.md cover
						Docker Compose, another machine and Google Colab.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void setCik("");
		void setQ(draft.trim());
	};

	return (
		<div className="flex min-h-0 flex-col gap-6">
			<form onSubmit={submit} className="flex max-w-xl gap-2">
				<Input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="Company name, ticker or CIK — Apple, AAPL, 320193"
					aria-label="Search SEC EDGAR"
				/>
				<Button type="submit" disabled={draft.trim().length === 0}>
					Search
				</Button>
			</form>

			{cik ? (
				<SecCompany cik={cik} onBack={() => void setCik("")} />
			) : (
				<SearchResults
					query={q}
					state={search}
					onPick={(picked) => void setCik(picked)}
				/>
			)}
		</div>
	);
}

function SearchResults({
	query,
	state,
	onPick,
}: {
	query: string;
	state: ReturnType<
		typeof useQuery<
			Awaited<ReturnType<typeof readEdgar<typeof edgarCompanySearch>>>
		>
	>;
	onPick: (cik: string) => void;
}) {
	if (!query.trim()) {
		return (
			<p className="text-muted-foreground text-sm">
				Search a US public company to read its filings, its 5%+ shareholders and
				its proxy statement, then hand it to the agent to import.
			</p>
		);
	}
	if (state.isPending) {
		return (
			<p className="flex items-center gap-2 text-muted-foreground text-sm">
				<Spinner /> Searching EDGAR…
			</p>
		);
	}
	if (state.isError || !state.data) {
		return (
			<p className="text-destructive text-sm">The search failed. Try again.</p>
		);
	}
	if (state.data.status !== "ok") {
		return <p className="text-destructive text-sm">{state.data.reason}</p>;
	}
	if (state.data.data.companies.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Nothing in EDGAR matches “{query}”. Only companies that file with the
				SEC are listed; try the ticker.
			</p>
		);
	}

	return (
		<SimpleTable
			surface="page"
			columns={[
				{ id: "name", header: "Company" },
				{ id: "ticker", header: "Ticker", width: "w-28" },
				{ id: "exchange", header: "Exchange", width: "w-32" },
				{ id: "cik", header: "CIK", width: "w-32", align: "right" },
			]}
		>
			{state.data.data.companies.map((company) => (
				<SimpleTableRow
					key={company.cik}
					clickable
					onClick={() => onPick(company.cik)}
				>
					<TableCell className="font-medium">{company.name}</TableCell>
					<TableCell>{company.ticker ?? "—"}</TableCell>
					<TableCell>{company.exchange ?? "—"}</TableCell>
					<TableCell className="text-right tabular-nums">
						{company.cik}
					</TableCell>
				</SimpleTableRow>
			))}
		</SimpleTable>
	);
}
