"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Email from "@carbon/icons-react/es/Email";
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
import { serviceFocusHistory, toServiceListInput } from "@/lib/service-input";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { serviceSearchParams } from "./service-search-params";

type ServiceCustomer = {
	id: string;
	name: string;
	status: string;
	company: { id: string; name: string; domain: string | null } | null;
} | null;

type ServiceSource = {
	id: string;
	source: string;
	externalId: string;
	url: string | null;
	contentHash: string | null;
	payload: unknown;
	receivedAt: string;
	createdAt: string;
};

type ServiceEvent = {
	id: string;
	eventType: string;
	actorType: string | null;
	actorId: string | null;
	body: string | null;
	data: unknown;
	occurredAt: string;
	createdAt: string;
};

type ServiceReplyDraft = {
	id: string;
	channel: string;
	provider: string;
	recipients: unknown;
	subject: string | null;
	body: string;
	contentDigest: string;
	status: string;
	approvalRequestId: string | null;
	idempotencyKey: string;
	sentAt: string | null;
	errorMessage: string | null;
	createdAt: string;
	updatedAt: string;
};

type ServiceWork = {
	id: string;
	queue: string;
	state: string;
	urgency: string;
	reason: string;
	primaryAction: string;
	evidence: unknown;
	updatedAt: string;
};

type ServiceApproval = {
	id: string;
	action: string;
	status: string;
	risk: string;
	contentDigest: string;
	contentSnapshot: unknown;
	expiresAt: string;
	requestedAt: string;
};

type ServiceReceipt = {
	id: string;
	operationKey: string | null;
	status: string;
	provider: string;
	channel: string | null;
	result: unknown;
	completedAt: string | null;
	createdAt: string;
};

type ServiceRow = {
	id: string;
	customerAccount: ServiceCustomer;
	dedupeKey: string;
	subjectType: string | null;
	subjectId: string | null;
	provider: string | null;
	externalId: string | null;
	channel: string;
	queue: string | null;
	title: string;
	description: string | null;
	status: string;
	priority: string;
	matchState: string;
	matchMethod: string | null;
	matchEvidence: unknown;
	matchedAt: string | null;
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	slaPolicy: {
		id: string;
		policyKey: string;
		name: string;
		channel: string | null;
		priority: string;
		firstResponseMinutes: number;
		resolutionMinutes: number;
		status: string;
	} | null;
	openedAt: string;
	firstResponseAt: string | null;
	dueAt: string | null;
	resolvedAt: string | null;
	sources: ServiceSource[];
	events: ServiceEvent[];
	triageProposals: unknown[];
	replyDrafts: ServiceReplyDraft[];
	escalations: unknown[];
	productHandoffs: unknown[];
	counts: {
		sources: number;
		events: number;
		triageProposals: number;
		replyDrafts: number;
		escalations: number;
		productHandoffs: number;
		openWork: number;
		pendingApprovals: number;
	};
	disabledReasons: string[];
	createdAt: string;
	updatedAt: string;
};

type ServiceDetail = ServiceRow & {
	work: ServiceWork[];
	approvals: ServiceApproval[];
	receipts: ServiceReceipt[];
};

type ServiceListData = {
	rows: ServiceRow[];
	total: number;
	facetCounts: Record<string, Record<string, number>>;
};

const STATUS_LABELS: Record<string, string> = {
	NEW: "New",
	OPEN: "Open",
	PENDING_CUSTOMER: "Waiting customer",
	PENDING_INTERNAL: "Waiting internal",
	RESOLVED: "Resolved",
	CLOSED: "Closed",
};

const STATUS_TONES: Record<string, StatusTone> = {
	NEW: "info",
	OPEN: "primary",
	PENDING_CUSTOMER: "warning",
	PENDING_INTERNAL: "warning",
	RESOLVED: "success",
	CLOSED: "neutral",
};

const PRIORITY_TONES: Record<string, StatusTone> = {
	LOW: "neutral",
	NORMAL: "info",
	HIGH: "warning",
	URGENT: "error",
};

const MATCH_TONES: Record<string, StatusTone> = {
	UNMATCHED: "warning",
	MATCH_PROPOSED: "info",
	MATCHED: "success",
	EXCLUDED: "neutral",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
	value,
	label,
}));

const PRIORITY_OPTIONS = ["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => ({
	value,
	label: label(value),
}));

const MATCH_OPTIONS = [
	"UNMATCHED",
	"MATCH_PROPOSED",
	"MATCHED",
	"EXCLUDED",
].map((value) => ({
	value,
	label: label(value),
}));

function label(value: string): string {
	return value
		.toLocaleLowerCase()
		.replaceAll("_", " ")
		.replace(/(^| )\S/g, (letter) => letter.toUpperCase());
}

function facetOptions(
	counts: Record<string, number> | undefined,
	labels?: Record<string, string>,
) {
	return Object.keys(counts ?? {})
		.sort()
		.map((value) => ({ value, label: labels?.[value] ?? label(value) }));
}

function displayValue(value: unknown): string {
	if (typeof value === "string") return value;
	if (value == null) return "-";
	try {
		return JSON.stringify(value);
	} catch {
		return "-";
	}
}

function columnsForService(
	onFocus: (id: string) => void,
): DataTableColumn<ServiceRow>[] {
	return [
		{
			id: "title",
			header: "Case",
			sortable: true,
			hideable: false,
			width: "w-[31%]",
			cell: (row) => (
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2 min-w-0 max-w-full justify-start text-left font-medium"
					type="button"
					data-service-focus={row.id}
					onClick={(event) => {
						event.stopPropagation();
						onFocus(row.id);
					}}
				>
					<span className="flex min-w-0 items-center gap-2">
						<Icon icon={Email} />
						<span className="truncate">{row.title}</span>
					</span>
				</Button>
			),
		},
		{
			id: "status",
			header: "Status",
			sortable: true,
			width: "w-[14%]",
			cell: (row) => (
				<StatusIndicator
					tone={STATUS_TONES[row.status] ?? "neutral"}
					label={STATUS_LABELS[row.status] ?? label(row.status)}
					size="sm"
				/>
			),
		},
		{
			id: "priority",
			header: "Priority",
			sortable: true,
			width: "w-[12%]",
			hideBelow: "lg",
			cell: (row) => (
				<StatusIndicator
					tone={PRIORITY_TONES[row.priority] ?? "neutral"}
					label={label(row.priority)}
					size="sm"
				/>
			),
		},
		{
			id: "customer",
			header: "Customer",
			sortable: true,
			width: "w-[18%]",
			hideBelow: "md",
			cell: (row) =>
				row.customerAccount ? (
					<span className="truncate">{row.customerAccount.name}</span>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "work",
			header: "Work",
			width: "w-[10%]",
			hideBelow: "lg",
			cell: (row) => (
				<span className="flex items-center gap-1 text-muted-foreground text-xs">
					<Icon icon={Task} />
					<span className="tabular-nums">{row.counts.openWork}</span>
				</span>
			),
		},
		{
			id: "dueAt",
			header: "Due",
			label: "SLA due",
			sortable: true,
			align: "right",
			width: "w-[15%]",
			cell: (row) =>
				row.dueAt ? (
					<span className="text-muted-foreground">
						<LocalRelativeTime date={row.dueAt} />
					</span>
				) : (
					<EmptyCellValue />
				),
		},
	];
}

export function ServiceTable() {
	const trpc = useTRPC();
	const { query, input: rawInput } = useTableQuery(serviceSearchParams);
	const [focusId, setFocusId] = useQueryState("case", parseAsString);
	const input = toServiceListInput(rawInput);
	const service = useQuery({
		...trpc.service.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const focus = useCallback(
		(id: string) => void setFocusId(id, { history: serviceFocusHistory(true) }),
		[setFocusId],
	);
	const closeFocus = useCallback(
		() => void setFocusId(null, { history: serviceFocusHistory(false) }),
		[setFocusId],
	);
	const columns = useMemo(() => columnsForService(focus), [focus]);
	const serviceData = service.data as unknown as ServiceListData | undefined;
	const facetCounts = serviceData?.facetCounts;
	const facets: DataTableFacet[] = [
		{
			id: "status",
			label: "Status",
			options: STATUS_OPTIONS.filter(
				(option) => (facetCounts?.status?.[option.value] ?? 0) > 0,
			),
		},
		{
			id: "priority",
			label: "Priority",
			options: PRIORITY_OPTIONS.filter(
				(option) => (facetCounts?.priority?.[option.value] ?? 0) > 0,
			),
		},
		{
			id: "matchState",
			label: "Match",
			options: MATCH_OPTIONS,
		},
		{
			id: "queue",
			label: "Queue",
			options: facetOptions(facetCounts?.queue),
		},
		{
			id: "customer",
			label: "Customer",
			options: facetOptions(facetCounts?.customer),
		},
	];

	return (
		<>
			<DataTable
				query={query}
				search={
					<ListSearch
						placeholder="Search cases, customers or inbound sources..."
						label="Search service cases"
					/>
				}
				columns={columns}
				rows={serviceData?.rows ?? []}
				total={serviceData?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				getRowId={(row) => row.id}
				loading={service.isFetching}
				onRowClick={(row) => focus(row.id)}
				empty={
					service.isError
						? "Service cases could not be loaded. Try again."
						: "No service cases match this view."
				}
			/>
			<ServiceDetailSheet caseId={focusId} onClose={closeFocus} />
		</>
	);
}

function ServiceDetailSheet({
	caseId,
	onClose,
}: {
	caseId: string | null;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const detail = useQuery({
		...trpc.service.byId.queryOptions({ id: caseId ?? "" }),
		enabled: caseId !== null,
	});
	const serviceCase = detail.data as unknown as ServiceDetail | undefined;
	return (
		<DetailSheet
			open={caseId !== null}
			onOpenChange={(open) => !open && onClose()}
		>
			{!serviceCase && detail.isPending ? (
				<DetailSheetEmpty
					icon={Email}
					title="Loading case"
					description="The service case is being loaded."
				/>
			) : null}
			{!serviceCase && detail.isError ? (
				<DetailSheetEmpty
					icon={WarningAlt}
					title="Case unavailable"
					description="The service queue could not load this record."
					action={
						<Button type="button" onClick={() => void detail.refetch()}>
							Retry
						</Button>
					}
				/>
			) : null}
			{serviceCase ? (
				<ServiceDetailView
					serviceCase={serviceCase}
					workspaceUrl={workspaceUrl}
					onClose={onClose}
				/>
			) : null}
		</DetailSheet>
	);
}

function ServiceDetailView({
	serviceCase,
	workspaceUrl,
	onClose,
}: {
	serviceCase: ServiceDetail;
	workspaceUrl: (path?: string) => string;
	onClose: () => void;
}) {
	const latestDraft = serviceCase.replyDrafts[0];
	return (
		<>
			<DetailSheetHeader
				title={serviceCase.title}
				description={
					serviceCase.customerAccount?.name ??
					serviceCase.description ??
					"Unmatched inbound case"
				}
				note={
					<>
						<StatusIndicator
							tone={STATUS_TONES[serviceCase.status] ?? "neutral"}
							label={
								STATUS_LABELS[serviceCase.status] ?? label(serviceCase.status)
							}
							size="sm"
						/>
						<StatusIndicator
							tone={MATCH_TONES[serviceCase.matchState] ?? "neutral"}
							label={label(serviceCase.matchState)}
							size="sm"
						/>
					</>
				}
				onClose={onClose}
			/>
			<DetailSheetBody>
				<DetailSheetSection title="Readiness">
					<DetailSheetProperties>
						<DetailSheetProperty label="Priority">
							{label(serviceCase.priority)}
						</DetailSheetProperty>
						<DetailSheetProperty label="SLA due">
							{serviceCase.dueAt ? (
								<LocalRelativeTime date={serviceCase.dueAt} />
							) : (
								"No SLA"
							)}
						</DetailSheetProperty>
						<DetailSheetProperty label="Sources">
							{serviceCase.counts.sources}
						</DetailSheetProperty>
						<DetailSheetProperty label="Open work">
							{serviceCase.counts.openWork}
						</DetailSheetProperty>
						<DetailSheetProperty label="Approvals">
							{serviceCase.counts.pendingApprovals}
						</DetailSheetProperty>
						<DetailSheetProperty label="Queue">
							{serviceCase.queue ?? "service"}
						</DetailSheetProperty>
					</DetailSheetProperties>
				</DetailSheetSection>
				<DetailSheetSection title="Disabled execution">
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap gap-2">
							<Button type="button" size="sm" disabled>
								Send disabled
							</Button>
							<Button type="button" size="sm" variant="outline" disabled>
								Provider schedule disabled
							</Button>
						</div>
						{serviceCase.disabledReasons.map((reason) => (
							<DetailSheetProse key={reason}>{reason}</DetailSheetProse>
						))}
					</div>
				</DetailSheetSection>
				<DetailSheetSection
					title="Work"
					action={
						<Button asChild variant="outline" size="xs">
							<Link href={workspaceUrl("/work?queue=service")}>Open queue</Link>
						</Button>
					}
				>
					{serviceCase.work.length === 0 ? (
						<DetailSheetProse>No service work recorded.</DetailSheetProse>
					) : (
						<div className="flex flex-col gap-1">
							{serviceCase.work.map((work) => (
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
				<DetailSheetSection title="Reply draft">
					{latestDraft ? (
						<div className="flex flex-col gap-2">
							<div className="flex flex-wrap gap-2">
								<StatusIndicator
									tone={
										latestDraft.status === "APPROVED" ? "success" : "warning"
									}
									label={label(latestDraft.status)}
									size="sm"
								/>
								<Badge variant="outline">{latestDraft.channel}</Badge>
								<Badge variant="outline">{latestDraft.provider}</Badge>
							</div>
							<DetailSheetProperties columns={1}>
								<DetailSheetProperty label="Subject" wide>
									{latestDraft.subject ?? "No subject"}
								</DetailSheetProperty>
								<DetailSheetProperty label="Recipients" wide>
									{displayValue(latestDraft.recipients)}
								</DetailSheetProperty>
								<DetailSheetProperty label="Digest" wide>
									<span className="break-all">{latestDraft.contentDigest}</span>
								</DetailSheetProperty>
							</DetailSheetProperties>
							<DetailSheetProse>{latestDraft.body}</DetailSheetProse>
						</div>
					) : (
						<DetailSheetProse>No reply draft recorded.</DetailSheetProse>
					)}
				</DetailSheetSection>
				<DetailSheetSection title="Approvals and receipts">
					<div className="flex flex-col gap-2">
						{serviceCase.approvals.map((approval) => (
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
						{serviceCase.receipts.map((receipt) => (
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
						{serviceCase.approvals.length === 0 &&
						serviceCase.receipts.length === 0 ? (
							<DetailSheetProse>
								No service approvals or receipts recorded.
							</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
				<DetailSheetSection title="Sources">
					<div className="flex flex-col gap-2">
						{serviceCase.sources.map((source) => (
							<div key={source.id} className="flex min-w-0 flex-col gap-1">
								<div className="flex items-center gap-2 text-xs">
									<Badge variant="secondary">{source.source}</Badge>
									<span className="min-w-0 truncate text-muted-foreground">
										{source.externalId}
									</span>
								</div>
								<span className="text-muted-foreground text-xs">
									<LocalRelativeTime date={source.receivedAt} />
								</span>
							</div>
						))}
					</div>
				</DetailSheetSection>
				<DetailSheetSection title="Events">
					<div className="flex flex-col gap-2">
						{serviceCase.events.slice(0, 8).map((event) => (
							<div key={event.id} className="flex min-w-0 flex-col gap-1">
								<div className="flex items-center gap-2 text-xs">
									<StatusIndicator
										tone={event.eventType === "MESSAGE" ? "info" : "neutral"}
										label={label(event.eventType)}
										size="sm"
									/>
									<span className="text-muted-foreground">
										<LocalRelativeTime date={event.occurredAt} />
									</span>
								</div>
								{event.body ? (
									<DetailSheetProse>{event.body}</DetailSheetProse>
								) : null}
							</div>
						))}
					</div>
				</DetailSheetSection>
			</DetailSheetBody>
		</>
	);
}
