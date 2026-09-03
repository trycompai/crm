"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Link } from "@crm/ui/components/link";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCard } from "@crm/ui/components/stat-card";
import { TableCell } from "@crm/ui/components/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import {
	type EdgarCompany,
	type EdgarProxy,
	edgarCompany,
	edgarFilings,
	edgarInsiders,
	edgarOwners,
	edgarProxy,
} from "@crm/validation/edgar";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { type Answer, count, money, percent, readEdgar } from "./edgar-client";

const FORMS = [
	"all",
	"10-K",
	"10-Q",
	"8-K",
	"DEF 14A",
	"SCHEDULE 13G",
	"SC 13D",
	"4",
] as const;
const FILINGS_LIMIT = 25;
const OWNERS_LIMIT = 20;
const INSIDERS_LIMIT = 20;
const PROXY_YEARS = 5;

function importPrompt(company: EdgarCompany): string {
	const ticker = company.tickers[0] ? `, ticker ${company.tickers[0]}` : "";
	return `Import ${company.name} (CIK ${company.cik}${ticker}) from SEC EDGAR into the CRM: the company with its CIK, ticker, SIC and state, the executives named in its latest DEF 14A as contacts with the filing as their source, and a note on its 5%+ shareholders.`;
}

function Status<T>({
	state,
	children,
}: {
	state: { isPending: boolean; isError: boolean; data: Answer<T> | undefined };
	children: (data: T) => React.ReactNode;
}) {
	if (state.isPending) {
		return (
			<p className="flex items-center gap-2 text-muted-foreground text-sm">
				<Spinner /> Reading EDGAR…
			</p>
		);
	}
	if (state.isError || !state.data) {
		return (
			<p className="text-destructive text-sm">The request failed. Try again.</p>
		);
	}
	if (state.data.status === "missing") {
		return <p className="text-muted-foreground text-sm">{state.data.reason}</p>;
	}
	if (state.data.status === "failed") {
		return <p className="text-destructive text-sm">{state.data.reason}</p>;
	}
	return <>{children(state.data.data)}</>;
}

export function SecCompany({
	cik,
	onBack,
}: {
	cik: string;
	onBack: () => void;
}) {
	const profile = useQuery({
		queryKey: ["edgar", "company", cik],
		queryFn: () => readEdgar(`companies/${cik}`, {}, edgarCompany),
		staleTime: 60 * 60_000,
	});

	return (
		<div className="flex min-h-0 flex-col gap-6">
			<Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
				← Back to results
			</Button>
			<Status state={profile}>
				{(company) => (
					<>
						<CompanyHeader company={company} />
						<Tabs defaultValue="filings" className="min-h-0">
							<TabsList>
								<TabsTrigger value="filings">Filings</TabsTrigger>
								<TabsTrigger value="holders">Holders</TabsTrigger>
								<TabsTrigger value="proxy">Proxy &amp; pay</TabsTrigger>
								<TabsTrigger value="insiders">Insiders</TabsTrigger>
							</TabsList>
							<TabsContent value="filings">
								<Filings cik={company.cik} />
							</TabsContent>
							<TabsContent value="holders">
								<Holders cik={company.cik} />
							</TabsContent>
							<TabsContent value="proxy">
								<ProxyTab cik={company.cik} />
							</TabsContent>
							<TabsContent value="insiders">
								<Insiders cik={company.cik} />
							</TabsContent>
						</Tabs>
					</>
				)}
			</Status>
		</div>
	);
}

function CompanyHeader({ company }: { company: EdgarCompany }) {
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const trpc = useTRPC();
	const handOff = useMutation(
		trpc.conversations.createBuilder.mutationOptions({
			onSuccess: ({ id }) => router.push(workspaceUrl(`/chat/${id}`)),
			onError: (error) => toast.error(error.message),
		}),
	);

	const address = company.businessAddress;
	const place = [address?.city, address?.state].filter(Boolean).join(", ");

	return (
		<div className="flex flex-wrap items-start justify-between gap-4">
			<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="font-medium text-xl">{company.name}</h2>
					{company.tickers.map((ticker) => (
						<Badge key={ticker} variant="secondary">
							{ticker}
						</Badge>
					))}
				</div>
				<p className="text-muted-foreground text-sm">
					{[
						company.sicDescription
							? `${company.sicDescription} (SIC ${company.sic})`
							: null,
						place || null,
						company.stateOfIncorporation
							? `Incorporated in ${company.stateOfIncorporation}`
							: null,
						company.fiscalYearEnd
							? `Fiscal year ends ${company.fiscalYearEnd.slice(0, 2)}/${company.fiscalYearEnd.slice(2)}`
							: null,
						company.category,
					]
						.filter(Boolean)
						.join(" · ")}
				</p>
				<p className="text-sm">
					<Link href={company.url} target="_blank" rel="noreferrer">
						EDGAR record for CIK {company.cik}
					</Link>
				</p>
			</div>
			<Button
				onClick={() =>
					handOff.mutate({
						clientRequestId: crypto.randomUUID(),
						commandType: "CHAT",
						message: importPrompt(company),
						resources: [],
						attachments: [],
					})
				}
				disabled={handOff.isPending}
			>
				{handOff.isPending ? "Handing to the agent…" : "Import with the agent"}
			</Button>
		</div>
	);
}

function Filings({ cik }: { cik: string }) {
	const [form, setForm] = useState<(typeof FORMS)[number]>("all");
	const filings = useQuery({
		queryKey: ["edgar", "filings", cik, form],
		queryFn: () =>
			readEdgar(
				`companies/${cik}/filings`,
				{ form: form === "all" ? undefined : form, limit: FILINGS_LIMIT },
				edgarFilings,
			),
		staleTime: 10 * 60_000,
	});

	return (
		<div className="flex flex-col gap-3">
			<Select
				value={form}
				onValueChange={(next) => setForm(next as (typeof FORMS)[number])}
			>
				<SelectTrigger className="w-48" aria-label="Form type">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{FORMS.map((option) => (
						<SelectItem key={option} value={option}>
							{option === "all" ? "All forms" : option}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Status state={filings}>
				{(data) =>
					data.filings.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No filing of that form.
						</p>
					) : (
						<SimpleTable
							surface="page"
							columns={[
								{ id: "form", header: "Form", width: "w-32" },
								{ id: "filed", header: "Filed", width: "w-32" },
								{ id: "period", header: "Period", width: "w-32" },
								{ id: "description", header: "Description" },
							]}
						>
							{data.filings.map((filing) => (
								<SimpleTableRow key={filing.accession}>
									<TableCell className="font-medium">{filing.form}</TableCell>
									<TableCell className="tabular-nums">
										{filing.filedAt}
									</TableCell>
									<TableCell className="tabular-nums">
										{filing.reportDate ?? "—"}
									</TableCell>
									<TableCell>
										<Link href={filing.url} target="_blank" rel="noreferrer">
											{filing.description ?? filing.accession}
										</Link>
									</TableCell>
								</SimpleTableRow>
							))}
						</SimpleTable>
					)
				}
			</Status>
		</div>
	);
}

function Holders({ cik }: { cik: string }) {
	const owners = useQuery({
		queryKey: ["edgar", "owners", cik],
		queryFn: () =>
			readEdgar(
				`companies/${cik}/owners`,
				{ limit: OWNERS_LIMIT },
				edgarOwners,
			),
		staleTime: 10 * 60_000,
	});

	return (
		<Status state={owners}>
			{(data) =>
				data.owners.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No Schedule 13D or 13G at 5% or more in the filings read. Holders
						below 5% never file one.
					</p>
				) : (
					<SimpleTable
						surface="page"
						columns={[
							{ id: "filer", header: "Holder" },
							{ id: "form", header: "Form", width: "w-36" },
							{ id: "filed", header: "As of", width: "w-32" },
							{ id: "shares", header: "Shares", width: "w-28", align: "right" },
							{
								id: "percent",
								header: "Percent",
								width: "w-24",
								align: "right",
							},
						]}
					>
						{data.owners.map((owner) => (
							<SimpleTableRow key={`${owner.filer}-${owner.filedAt}`}>
								<TableCell className="font-medium">
									<Link href={owner.url} target="_blank" rel="noreferrer">
										{owner.filer}
									</Link>
									{owner.purpose ? (
										<span className="block text-muted-foreground text-xs">
											{owner.purpose}
										</span>
									) : null}
								</TableCell>
								<TableCell>{owner.form}</TableCell>
								<TableCell className="tabular-nums">{owner.filedAt}</TableCell>
								<TableCell className="text-right tabular-nums">
									{count(owner.shares)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{percent(owner.percent)}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)
			}
		</Status>
	);
}

function Insiders({ cik }: { cik: string }) {
	const insiders = useQuery({
		queryKey: ["edgar", "insiders", cik],
		queryFn: () =>
			readEdgar(
				`companies/${cik}/insiders`,
				{ limit: INSIDERS_LIMIT },
				edgarInsiders,
			),
		staleTime: 10 * 60_000,
	});

	return (
		<Status state={insiders}>
			{(data) =>
				data.transactions.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No insider filing in the period read.
					</p>
				) : (
					<SimpleTable
						surface="page"
						columns={[
							{ id: "insider", header: "Insider" },
							{ id: "title", header: "Title", width: "w-40" },
							{ id: "form", header: "Form", width: "w-20" },
							{ id: "filed", header: "Filed", width: "w-32" },
							{ id: "kind", header: "Transaction", width: "w-40" },
							{ id: "shares", header: "Shares", width: "w-28", align: "right" },
						]}
					>
						{data.transactions.map((row) => (
							<SimpleTableRow key={`${row.url}-${row.insider}`}>
								<TableCell className="font-medium">
									<Link href={row.url} target="_blank" rel="noreferrer">
										{row.insider}
									</Link>
								</TableCell>
								<TableCell>{row.title ?? "—"}</TableCell>
								<TableCell>{row.form}</TableCell>
								<TableCell className="tabular-nums">{row.filedAt}</TableCell>
								<TableCell>{row.kind?.replaceAll("_", " ") ?? "—"}</TableCell>
								<TableCell className="text-right tabular-nums">
									{count(row.shares)}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)
			}
		</Status>
	);
}

function ProxyTab({ cik }: { cik: string }) {
	const proxy = useQuery({
		queryKey: ["edgar", "proxy", cik],
		queryFn: () =>
			readEdgar(`companies/${cik}/proxy`, { years: PROXY_YEARS }, edgarProxy),
		staleTime: 60 * 60_000,
	});

	return <Status state={proxy}>{(data) => <ProxyView proxy={data} />}</Status>;
}

function ProxyView({ proxy }: { proxy: EdgarProxy }) {
	return (
		<div className="flex flex-col gap-6">
			<p className="text-sm">
				Latest proxy statement, filed {proxy.filedAt}:{" "}
				<Link href={proxy.url} target="_blank" rel="noreferrer">
					DEF 14A {proxy.accession}
				</Link>
			</p>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label={`CEO total pay${proxy.peo.name ? ` · ${proxy.peo.name}` : ""}`}
					value={money(proxy.peo.totalComp)}
				/>
				<StatCard
					label="CEO pay actually paid"
					value={money(proxy.peo.actuallyPaidComp)}
				/>
				<StatCard
					label="Other named executives, average"
					value={money(proxy.neoAverage.totalComp)}
				/>
				<StatCard
					label="CEO pay ratio"
					value={
						proxy.ceoPayRatio?.ratio === null || proxy.ceoPayRatio === null
							? "—"
							: `${Math.round(proxy.ceoPayRatio.ratio)} : 1`
					}
					description={
						proxy.ceoPayRatio?.medianEmployee === null ||
						proxy.ceoPayRatio === null
							? undefined
							: `Median employee ${money(proxy.ceoPayRatio.medianEmployee)}`
					}
				/>
			</div>

			<section className="flex flex-col gap-2">
				<h3 className="font-medium text-sm">Named executives</h3>
				{proxy.executives.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						This proxy carries no machine-readable compensation table.
					</p>
				) : (
					<SimpleTable
						surface="page"
						columns={[
							{ id: "name", header: "Name" },
							{ id: "title", header: "Title" },
							{ id: "year", header: "Year", width: "w-20" },
							{ id: "salary", header: "Salary", width: "w-28", align: "right" },
							{
								id: "stock",
								header: "Stock awards",
								width: "w-32",
								align: "right",
							},
							{ id: "total", header: "Total", width: "w-32", align: "right" },
						]}
					>
						{proxy.executives.map((executive) => (
							<SimpleTableRow key={`${executive.name}-${executive.year}`}>
								<TableCell className="font-medium">{executive.name}</TableCell>
								<TableCell>{executive.title ?? "—"}</TableCell>
								<TableCell className="tabular-nums">
									{executive.year ?? "—"}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{money(executive.salary)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{money(executive.stockAwards)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{money(executive.total)}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</section>

			<section className="flex flex-col gap-2">
				<h3 className="font-medium text-sm">Pay versus performance</h3>
				{proxy.payVsPerformance.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No pay-versus-performance table in this proxy.
					</p>
				) : (
					<SimpleTable
						surface="page"
						columns={[
							{ id: "year", header: "Fiscal year end", width: "w-36" },
							{
								id: "peo",
								header: "CEO actually paid",
								width: "w-36",
								align: "right",
							},
							{
								id: "neo",
								header: "NEO average actually paid",
								width: "w-44",
								align: "right",
							},
							{ id: "tsr", header: "TSR", width: "w-24", align: "right" },
							{ id: "peer", header: "Peer TSR", width: "w-24", align: "right" },
							{
								id: "income",
								header: "Net income",
								width: "w-32",
								align: "right",
							},
							{
								id: "measure",
								header: proxy.selectedMeasureName ?? "Selected measure",
								align: "right",
							},
						]}
					>
						{proxy.payVsPerformance.map((row) => (
							<SimpleTableRow key={row.fiscalYearEnd ?? "unknown"}>
								<TableCell className="tabular-nums">
									{row.fiscalYearEnd ?? "—"}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{money(row.peoActuallyPaidComp)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{money(row.neoAverageActuallyPaidComp)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{row.tsr ?? "—"}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{row.peerTsr ?? "—"}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{money(row.netIncome)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{money(row.selectedMeasureValue)}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</section>

			<div className="grid gap-6 lg:grid-cols-2">
				<section className="flex flex-col gap-2">
					<h3 className="font-medium text-sm">Holders the proxy lists</h3>
					{proxy.holders.length === 0 ? (
						<p className="text-muted-foreground text-sm">None listed.</p>
					) : (
						<SimpleTable
							surface="page"
							columns={[
								{ id: "name", header: "Holder" },
								{
									id: "shares",
									header: "Shares",
									width: "w-28",
									align: "right",
								},
								{
									id: "percent",
									header: "Percent",
									width: "w-24",
									align: "right",
								},
							]}
						>
							{proxy.holders.map((holder) => (
								<SimpleTableRow key={holder.name}>
									<TableCell className="font-medium">{holder.name}</TableCell>
									<TableCell className="text-right tabular-nums">
										{count(holder.shares)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{percent(holder.percentOfClass)}
									</TableCell>
								</SimpleTableRow>
							))}
						</SimpleTable>
					)}
				</section>

				<section className="flex flex-col gap-2">
					<h3 className="font-medium text-sm">Proposals and governance</h3>
					<ul className="flex flex-col gap-1 text-sm">
						{proxy.proposals.map((proposal) => (
							<li key={`${proposal.number}-${proposal.description}`}>
								{proposal.number ? `${proposal.number}. ` : ""}
								{proposal.description}
							</li>
						))}
						<li className="text-muted-foreground">
							Insider trading policy adopted:{" "}
							{proxy.insiderTradingPolicyAdopted === null
								? "not stated"
								: proxy.insiderTradingPolicyAdopted
									? "yes"
									: "no"}
						</li>
						{proxy.performanceMeasures.length > 0 ? (
							<li className="text-muted-foreground">
								Performance measures: {proxy.performanceMeasures.join(", ")}
							</li>
						) : null}
					</ul>
				</section>
			</div>
		</div>
	);
}
