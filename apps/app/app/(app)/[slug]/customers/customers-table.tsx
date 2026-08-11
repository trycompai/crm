"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Building from "@carbon/icons-react/es/Building";
import Task from "@carbon/icons-react/es/Task";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	DataTable,
	type DataTableColumn,
	type DataTableFacet,
} from "@crm/ui/components/data-table";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";
import { OwnerCell } from "@/components/crm/owner-cell";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import {
	DetailSheet,
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetHeader,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetProse,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { LocalRelativeTime } from "@/components/local-date-time";
import {
	customerFocusHistory,
	toCustomerListInput,
} from "@/lib/customer-input";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { customersSearchParams } from "./customers-search-params";

type CustomerRow = RouterOutputs["customers"]["list"]["rows"][number];
type CustomerWork = {
	id: string;
	subjectType: string;
	subjectId: string;
	queue: string;
	state: string;
	urgency: string;
	reason: string;
	primaryAction: string;
	evidence: unknown;
	updatedAt: string;
};
type CustomerApproval = {
	id: string;
	action: string;
	status: string;
	risk: string;
	contentDigest: string;
	expiresAt: string;
	requestedAt: string;
};
type CustomerReceipt = {
	id: string;
	operationKey: string | null;
	status: string;
	provider: string;
	channel: string | null;
	result: unknown;
	completedAt: string | null;
	createdAt: string;
};
type CustomerOnboarding = {
	id: string;
	dealId: string;
	deal: { id: string; name: string; stage: string };
	status: string;
	objective: string | null;
	systemsSummary: string | null;
	dataSummary: string | null;
	brainPlan: string | null;
	targetLiveAt: string | null;
	incompleteItems: number;
	items: {
		id: string;
		kind: string;
		status: string;
		name: string;
		details: string | null;
		ownerName: string | null;
		source: string | null;
		dueAt: string | null;
		position: number;
		updatedAt: string;
	}[];
	updatedAt: string;
};
type CustomerInstance = {
	id: string;
	key: string;
	name: string;
	environment: string;
	region: string | null;
	status: string;
	metadata: unknown;
	updatedAt: string;
};
type CustomerDetail = Omit<CustomerRow, "instances" | "onboarding"> & {
	onboarding: CustomerOnboarding | null;
	instances: CustomerInstance[];
	work: CustomerWork[];
	approvals: CustomerApproval[];
	receipts: CustomerReceipt[];
	supportCases: {
		id: string;
		title: string;
		status: string;
		priority: string;
		channel: string;
		dueAt: string | null;
		updatedAt: string;
	}[];
};

const STATUS_LABELS: Record<CustomerRow["status"], string> = {
	PROSPECT: "Prospect",
	ACTIVE: "Active",
	SUSPENDED: "Suspended",
	CLOSED: "Closed",
};

const STATUS_TONES: Record<CustomerRow["status"], StatusTone> = {
	PROSPECT: "neutral",
	ACTIVE: "success",
	SUSPENDED: "warning",
	CLOSED: "neutral",
};

const ONBOARDING_TONES: Record<string, StatusTone> = {
	DISCOVERY: "info",
	SYSTEMS: "primary",
	DATA_ACCESS: "warning",
	INGESTION: "warning",
	READY: "success",
	LIVE: "success",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
	value,
	label,
}));

const ONBOARDING_OPTIONS = [
	{ value: "DISCOVERY", label: "Discovery" },
	{ value: "SYSTEMS", label: "Systems" },
	{ value: "DATA_ACCESS", label: "Data access" },
	{ value: "INGESTION", label: "Ingestion" },
	{ value: "READY", label: "Ready" },
	{ value: "LIVE", label: "Live" },
];

function label(value: string): string {
	return value
		.toLocaleLowerCase()
		.replaceAll("_", " ")
		.replace(/(^| )\S/g, (letter) => letter.toUpperCase());
}

function columnsForCustomers(
	onFocus: (id: string) => void,
): DataTableColumn<CustomerRow>[] {
	return [
		{
			id: "name",
			header: "Customer",
			sortable: true,
			hideable: false,
			width: "w-[28%]",
			cell: (row) => (
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2 min-w-0 max-w-full justify-start text-left font-medium"
					type="button"
					data-customer-focus={row.id}
					onClick={(event) => {
						event.stopPropagation();
						onFocus(row.id);
					}}
				>
					<span className="flex min-w-0 items-center gap-2">
						<Icon icon={Building} />
						<span className="truncate">{row.name}</span>
					</span>
				</Button>
			),
		},
		{
			id: "status",
			header: "Status",
			sortable: true,
			width: "w-[12%]",
			cell: (row) => (
				<StatusIndicator
					tone={STATUS_TONES[row.status]}
					label={STATUS_LABELS[row.status]}
					size="sm"
				/>
			),
		},
		{
			id: "onboardingStatus",
			header: "Onboarding",
			width: "w-[15%]",
			cell: (row) =>
				row.onboarding ? (
					<StatusIndicator
						tone={ONBOARDING_TONES[row.onboarding.status] ?? "neutral"}
						label={label(row.onboarding.status)}
						size="sm"
					/>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "owner",
			header: "Owner",
			sortable: true,
			width: "w-[16%]",
			hideBelow: "md",
			cell: (row) => <OwnerCell owner={row.owner} />,
		},
		{
			id: "work",
			header: "Work",
			width: "w-[12%]",
			hideBelow: "lg",
			cell: (row) => (
				<span className="flex items-center gap-1 text-muted-foreground text-xs">
					<Icon icon={Task} />
					<span className="tabular-nums">{row.counts.openWork}</span>
				</span>
			),
		},
		{
			id: "instances",
			header: "Instances",
			width: "w-[12%]",
			hideBelow: "lg",
			cell: (row) => (
				<span className="text-muted-foreground text-xs tabular-nums">
					{row.counts.instances}
				</span>
			),
		},
		{
			id: "updatedAt",
			header: "Updated",
			label: "Updated date",
			sortable: true,
			align: "right",
			width: "w-[14%]",
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeTime date={row.updatedAt} />
				</span>
			),
		},
	];
}

export function CustomersTable() {
	const trpc = useTRPC();
	const { query, input: rawInput } = useTableQuery(customersSearchParams);
	const [focusId, setFocusId] = useQueryState("customer", parseAsString);
	const input = toCustomerListInput(rawInput);
	const customers = useQuery({
		...trpc.customers.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const focus = useCallback(
		(id: string) =>
			void setFocusId(id, { history: customerFocusHistory(true) }),
		[setFocusId],
	);
	const closeFocus = useCallback(
		() => void setFocusId(null, { history: customerFocusHistory(false) }),
		[setFocusId],
	);
	const columns = useMemo(() => columnsForCustomers(focus), [focus]);
	const facets: DataTableFacet[] = [
		{ id: "status", label: "Status", options: STATUS_OPTIONS },
		{
			id: "onboardingStatus",
			label: "Onboarding",
			options: ONBOARDING_OPTIONS,
		},
	];

	return (
		<>
			<DataTable
				query={query}
				search={
					<ListSearch
						placeholder="Search customers, companies or won deals…"
						label="Search customers"
					/>
				}
				columns={columns}
				rows={customers.data?.rows ?? []}
				total={customers.data?.total ?? 0}
				facetCounts={customers.data?.facetCounts}
				loading={customers.isFetching}
				facets={facets}
				getRowId={(row) => row.id}
				onRowClick={(row) => focus(row.id)}
				empty="No customers match this view."
			/>
			<CustomerDetailSheet customerId={focusId} onClose={closeFocus} />
		</>
	);
}

function CustomerDetailSheet({
	customerId,
	onClose,
}: {
	customerId: string | null;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const detail = useQuery({
		...trpc.customers.byId.queryOptions({ id: customerId ?? "" }),
		enabled: customerId !== null,
	});
	const customer = detail.data as CustomerDetail | undefined;
	return (
		<DetailSheet
			open={customerId !== null}
			onOpenChange={(open) => !open && onClose()}
		>
			{!customer && detail.isPending ? (
				<DetailSheetEmpty
					icon={Building}
					title="Loading customer"
					description="The customer record is being loaded."
				/>
			) : null}
			{!customer && detail.isError ? (
				<DetailSheetEmpty
					icon={WarningAlt}
					title="Customer unavailable"
					description="The customer queue could not load this record."
					action={
						<Button type="button" onClick={() => void detail.refetch()}>
							Retry
						</Button>
					}
				/>
			) : null}
			{customer ? (
				<CustomerDetailView
					customer={customer}
					workspaceUrl={workspaceUrl}
					onClose={onClose}
				/>
			) : null}
		</DetailSheet>
	);
}

function CustomerDetailView({
	customer,
	workspaceUrl,
	onClose,
}: {
	customer: CustomerDetail;
	workspaceUrl: (path?: string) => string;
	onClose: () => void;
}) {
	const onboarding = customer.onboarding;
	return (
		<>
			<DetailSheetHeader
				title={customer.name}
				description={customer.company?.domain ?? "No company domain recorded"}
				note={
					<>
						<StatusIndicator
							tone={STATUS_TONES[customer.status]}
							label={STATUS_LABELS[customer.status]}
							size="sm"
						/>
						{onboarding ? (
							<StatusIndicator
								tone={ONBOARDING_TONES[onboarding.status] ?? "neutral"}
								label={label(onboarding.status)}
								size="sm"
							/>
						) : null}
					</>
				}
				onClose={onClose}
			/>
			<DetailSheetBody>
				<DetailSheetSection title="Readiness">
					<DetailSheetProperties>
						<DetailSheetProperty label="Open work">
							{customer.counts.openWork}
						</DetailSheetProperty>
						<DetailSheetProperty label="Approvals">
							{customer.counts.pendingApprovals}
						</DetailSheetProperty>
						<DetailSheetProperty label="Instances">
							{customer.counts.instances}
						</DetailSheetProperty>
						<DetailSheetProperty label="Cases">
							{customer.counts.supportCases}
						</DetailSheetProperty>
					</DetailSheetProperties>
					{customer.gaps.length > 0 ? (
						<div className="flex flex-wrap gap-1">
							{customer.gaps.map((gap) => (
								<Badge key={gap} variant="outline">
									{label(gap)}
								</Badge>
							))}
						</div>
					) : null}
				</DetailSheetSection>
				<DetailSheetSection title="Disabled execution">
					<div className="flex flex-col gap-1">
						{customer.disabledReasons.map((reason) => (
							<DetailSheetProse key={reason}>{reason}</DetailSheetProse>
						))}
					</div>
				</DetailSheetSection>
				{onboarding ? (
					<DetailSheetSection title="Onboarding">
						<DetailSheetProperties columns={1}>
							<DetailSheetProperty label="Won deal">
								{onboarding.deal.name}
							</DetailSheetProperty>
							<DetailSheetProperty label="Objective" wide>
								{onboarding.objective ?? "Not confirmed"}
							</DetailSheetProperty>
							<DetailSheetProperty label="Systems" wide>
								{onboarding.systemsSummary ?? "Not mapped"}
							</DetailSheetProperty>
							<DetailSheetProperty label="Data" wide>
								{onboarding.dataSummary ?? "Not mapped"}
							</DetailSheetProperty>
							<DetailSheetProperty label="Brain plan" wide>
								{onboarding.brainPlan ?? "Not approved"}
							</DetailSheetProperty>
						</DetailSheetProperties>
						<div className="flex flex-col gap-1">
							{onboarding.items.map((item) => (
								<div
									key={item.id}
									className="flex min-w-0 items-center gap-2 text-xs"
								>
									<StatusIndicator
										tone={item.status === "COMPLETE" ? "success" : "warning"}
										label={label(item.status)}
										size="sm"
									/>
									<span className="truncate">{item.name}</span>
								</div>
							))}
						</div>
					</DetailSheetSection>
				) : null}
				<DetailSheetSection title="Instances">
					{customer.instances.length === 0 ? (
						<DetailSheetProse>No customer instances recorded.</DetailSheetProse>
					) : (
						<div className="flex flex-col gap-2">
							{customer.instances.map((instance) => (
								<div key={instance.id} className="flex items-center gap-2">
									<StatusIndicator
										tone={ONBOARDING_TONES[instance.status] ?? "neutral"}
										label={label(instance.status)}
										size="sm"
									/>
									<span className="min-w-0 flex-1 truncate text-xs">
										{instance.name}
									</span>
									<Badge variant="secondary">{instance.environment}</Badge>
								</div>
							))}
						</div>
					)}
				</DetailSheetSection>
				<DetailSheetSection
					title="Work"
					action={
						<Button asChild variant="outline" size="xs">
							<Link href={workspaceUrl("/work?queue=customers")}>
								Open queue
							</Link>
						</Button>
					}
				>
					{customer.work.length === 0 ? (
						<DetailSheetProse>No customer work recorded.</DetailSheetProse>
					) : (
						<div className="flex flex-col gap-1">
							{customer.work.map((work) => (
								<Button
									key={work.id}
									asChild
									variant="ghost"
									size="sm"
									className="h-auto justify-start px-0 text-left"
								>
									<Link
										href={workspaceUrl(
											`/work?work=${encodeURIComponent(work.id)}`,
										)}
									>
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate">{work.primaryAction}</span>
											<span className="truncate text-muted-foreground text-xs">
												{work.queue} · {label(work.state)}
											</span>
										</span>
										<Icon icon={ArrowRight} data-icon="inline-end" />
									</Link>
								</Button>
							))}
						</div>
					)}
				</DetailSheetSection>
				<DetailSheetSection title="Approvals and receipts">
					<div className="flex flex-col gap-2">
						{customer.approvals.map((approval) => (
							<Button
								key={approval.id}
								asChild
								variant="ghost"
								size="sm"
								className="h-auto justify-start px-0 text-left"
							>
								<Link
									href={workspaceUrl(
										`/?approval=${encodeURIComponent(approval.id)}`,
									)}
								>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate">{approval.action}</span>
										<span className="truncate text-muted-foreground text-xs">
											{label(approval.status)} · {approval.risk}
										</span>
									</span>
									<Icon icon={ArrowRight} data-icon="inline-end" />
								</Link>
							</Button>
						))}
						{customer.receipts.map((receipt) => (
							<div key={receipt.id} className="flex items-center gap-2 text-xs">
								<StatusIndicator
									tone={receipt.status === "SUCCEEDED" ? "success" : "warning"}
									label={label(receipt.status)}
									size="sm"
								/>
								<span className="min-w-0 flex-1 truncate">
									{receipt.operationKey ?? "Receipt"}
								</span>
							</div>
						))}
						{customer.approvals.length === 0 &&
						customer.receipts.length === 0 ? (
							<DetailSheetProse>
								No customer approvals or receipts recorded.
							</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
			</DetailSheetBody>
		</>
	);
}
