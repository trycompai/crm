"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Calendar from "@carbon/icons-react/es/Calendar";
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
import {
	marketingFocusHistory,
	toMarketingListInput,
} from "@/lib/marketing-input";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { marketingSearchParams } from "./marketing-search-params";

type MarketingContentVariant = {
	id: string;
	key: string;
	channel: string;
	content: string;
	status: string;
	metadata: unknown;
	createdAt: string;
	updatedAt: string;
};

type MarketingContentItem = {
	id: string;
	kind: string;
	title: string | null;
	brief: string | null;
	body: string | null;
	status: string;
	sourceUrl: string | null;
	metadata: unknown;
	createdAt: string;
	updatedAt: string;
	variants: MarketingContentVariant[];
};

type MarketingPublication = {
	id: string;
	contentItemId: string | null;
	contentVariantId: string | null;
	channel: string;
	provider: string;
	externalId: string | null;
	idempotencyKey: string;
	contentDigest: string;
	status: string;
	approvalRequestId: string | null;
	actionReceiptId: string | null;
	scheduledAt: string | null;
	publishedAt: string | null;
	receipt: unknown;
	errorMessage: string | null;
	createdAt: string;
	updatedAt: string;
};

type MarketingTouchpoint = {
	id: string;
	experimentId: string | null;
	subjectType: string;
	subjectId: string;
	channel: string;
	provider: string | null;
	externalId: string | null;
	occurredAt: string;
	metadata: unknown;
	createdAt: string;
	attributionCredits: Array<{
		id: string;
		subjectType: string;
		subjectId: string;
		model: string;
		credit: string;
		value: string | null;
		currency: string | null;
		createdAt: string;
	}>;
};

type MarketingWork = {
	id: string;
	queue: string;
	state: string;
	urgency: string;
	reason: string;
	primaryAction: string;
	evidence: unknown;
	updatedAt: string;
};

type MarketingApproval = {
	id: string;
	action: string;
	status: string;
	risk: string;
	contentDigest: string;
	contentSnapshot: unknown;
	expiresAt: string;
	requestedAt: string;
};

type MarketingReceipt = {
	id: string;
	operationKey: string | null;
	status: string;
	provider: string;
	channel: string | null;
	result: unknown;
	costUsd: string | null;
	completedAt: string | null;
	createdAt: string;
};

type MarketingRow = {
	id: string;
	name: string;
	channel: string | null;
	objective: string | null;
	status: string;
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	budget: string | null;
	currency: string;
	startsAt: string | null;
	endsAt: string | null;
	metadata: unknown;
	contentItems: MarketingContentItem[];
	experiments: unknown[];
	triageProposals: unknown[];
	touchpoints: MarketingTouchpoint[];
	publications: MarketingPublication[];
	sourceReceipts: Array<{
		id: string;
		contentItemId: string | null;
		source: string;
		externalId: string;
		url: string | null;
		contentHash: string;
		payload: unknown;
		capturedAt: string;
		createdAt: string;
	}>;
	counts: {
		contentItems: number;
		experiments: number;
		triageProposals: number;
		touchpoints: number;
		attributionCredits: number;
		publications: number;
		sourceReceipts: number;
		openWork: number;
		pendingApprovals: number;
	};
	disabledReasons: string[];
	createdAt: string;
	updatedAt: string;
};

type MarketingDetail = MarketingRow & {
	work: MarketingWork[];
	approvals: MarketingApproval[];
	receipts: MarketingReceipt[];
};

type MarketingListData = {
	rows: MarketingRow[];
	total: number;
	facetCounts: Record<string, Record<string, number>>;
};

const STATUS_LABELS: Record<string, string> = {
	DRAFT: "Draft",
	ACTIVE: "Active",
	PAUSED: "Paused",
	COMPLETED: "Completed",
	ARCHIVED: "Archived",
};

const STATUS_TONES: Record<string, StatusTone> = {
	DRAFT: "info",
	ACTIVE: "success",
	PAUSED: "warning",
	COMPLETED: "success",
	ARCHIVED: "neutral",
};

const PUBLICATION_TONES: Record<string, StatusTone> = {
	PLANNED: "info",
	SCHEDULED: "warning",
	PUBLISHED: "success",
	FAILED: "error",
	CANCELLED: "neutral",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
	value,
	label,
}));

function label(value: string): string {
	return value
		.toLocaleLowerCase()
		.replaceAll("_", " ")
		.replace(/(^| )\S/g, (letter) => letter.toUpperCase());
}

function facetOptions(counts: Record<string, number> | undefined) {
	return Object.keys(counts ?? {})
		.sort()
		.map((value) => ({ value, label: label(value) }));
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

function columnsForMarketing(
	onFocus: (id: string) => void,
): DataTableColumn<MarketingRow>[] {
	return [
		{
			id: "name",
			header: "Campaign",
			sortable: true,
			hideable: false,
			width: "w-[31%]",
			cell: (row) => (
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2 min-w-0 max-w-full justify-start text-left font-medium"
					type="button"
					data-marketing-focus={row.id}
					onClick={(event) => {
						event.stopPropagation();
						onFocus(row.id);
					}}
				>
					<span className="flex min-w-0 items-center gap-2">
						<Icon icon={Email} />
						<span className="truncate">{row.name}</span>
					</span>
				</Button>
			),
		},
		{
			id: "status",
			header: "Status",
			sortable: true,
			width: "w-[13%]",
			cell: (row) => (
				<StatusIndicator
					tone={STATUS_TONES[row.status] ?? "neutral"}
					label={STATUS_LABELS[row.status] ?? label(row.status)}
					size="sm"
				/>
			),
		},
		{
			id: "channel",
			header: "Channel",
			sortable: true,
			width: "w-[14%]",
			hideBelow: "md",
			cell: (row) =>
				row.channel ? (
					<Badge variant="outline">{row.channel}</Badge>
				) : (
					<EmptyCellValue />
				),
		},
		{
			id: "budget",
			header: "Budget",
			sortable: true,
			width: "w-[12%]",
			hideBelow: "lg",
			cell: (row) =>
				row.budget ? (
					<span className="tabular-nums">
						{row.currency} {row.budget}
					</span>
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
			id: "updatedAt",
			header: "Updated",
			sortable: true,
			align: "right",
			width: "w-[20%]",
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeTime date={row.updatedAt} />
				</span>
			),
		},
	];
}

export function MarketingTable() {
	const trpc = useTRPC();
	const { query, input: rawInput } = useTableQuery(marketingSearchParams);
	const [focusId, setFocusId] = useQueryState("campaign", parseAsString);
	const input = toMarketingListInput(rawInput);
	const marketing = useQuery({
		...trpc.marketing.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const focus = useCallback(
		(id: string) =>
			void setFocusId(id, { history: marketingFocusHistory(true) }),
		[setFocusId],
	);
	const closeFocus = useCallback(
		() => void setFocusId(null, { history: marketingFocusHistory(false) }),
		[setFocusId],
	);
	const columns = useMemo(() => columnsForMarketing(focus), [focus]);
	const marketingData = marketing.data as unknown as
		| MarketingListData
		| undefined;
	const facetCounts = marketingData?.facetCounts;
	const facets: DataTableFacet[] = [
		{
			id: "status",
			label: "Status",
			options: STATUS_OPTIONS.filter(
				(option) => (facetCounts?.status?.[option.value] ?? 0) > 0,
			),
		},
		{
			id: "channel",
			label: "Channel",
			options: facetOptions(facetCounts?.channel),
		},
		{
			id: "owner",
			label: "Owner",
			options: facetOptions(facetCounts?.owner),
		},
	];

	return (
		<>
			<DataTable
				query={query}
				search={
					<ListSearch
						placeholder="Search campaigns, content or attribution..."
						label="Search marketing campaigns"
					/>
				}
				columns={columns}
				rows={marketingData?.rows ?? []}
				total={marketingData?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				getRowId={(row) => row.id}
				loading={marketing.isFetching}
				onRowClick={(row) => focus(row.id)}
				empty={
					marketing.isError
						? "Marketing campaigns could not be loaded. Try again."
						: "No marketing campaigns match this view."
				}
			/>
			<MarketingDetailSheet campaignId={focusId} onClose={closeFocus} />
		</>
	);
}

function MarketingDetailSheet({
	campaignId,
	onClose,
}: {
	campaignId: string | null;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const detail = useQuery({
		...trpc.marketing.byId.queryOptions({ id: campaignId ?? "" }),
		enabled: campaignId !== null,
	});
	const campaign = detail.data as unknown as MarketingDetail | undefined;
	return (
		<DetailSheet
			open={campaignId !== null}
			onOpenChange={(open) => !open && onClose()}
		>
			{!campaign && detail.isPending ? (
				<DetailSheetEmpty
					icon={Email}
					title="Loading campaign"
					description="The marketing campaign is being loaded."
				/>
			) : null}
			{!campaign && detail.isError ? (
				<DetailSheetEmpty
					icon={WarningAlt}
					title="Campaign unavailable"
					description="The marketing queue could not load this record."
					action={
						<Button type="button" onClick={() => void detail.refetch()}>
							Retry
						</Button>
					}
				/>
			) : null}
			{campaign ? (
				<MarketingDetailView
					campaign={campaign}
					workspaceUrl={workspaceUrl}
					onClose={onClose}
				/>
			) : null}
		</DetailSheet>
	);
}

function MarketingDetailView({
	campaign,
	workspaceUrl,
	onClose,
}: {
	campaign: MarketingDetail;
	workspaceUrl: (path?: string) => string;
	onClose: () => void;
}) {
	const nextPublication = campaign.publications[0];
	const primaryContent = campaign.contentItems[0];
	return (
		<>
			<DetailSheetHeader
				title={campaign.name}
				description={campaign.objective ?? "Marketing plan proposal"}
				note={
					<>
						<StatusIndicator
							tone={STATUS_TONES[campaign.status] ?? "neutral"}
							label={STATUS_LABELS[campaign.status] ?? label(campaign.status)}
							size="sm"
						/>
						{campaign.channel ? (
							<Badge variant="outline">{campaign.channel}</Badge>
						) : null}
					</>
				}
				onClose={onClose}
			/>
			<DetailSheetBody>
				<DetailSheetSection title="Plan readiness">
					<DetailSheetProperties>
						<DetailSheetProperty label="Budget">
							{campaign.budget
								? `${campaign.currency} ${campaign.budget}`
								: "No budget"}
						</DetailSheetProperty>
						<DetailSheetProperty label="Content">
							{campaign.counts.contentItems}
						</DetailSheetProperty>
						<DetailSheetProperty label="Publications">
							{campaign.counts.publications}
						</DetailSheetProperty>
						<DetailSheetProperty label="Approvals">
							{campaign.counts.pendingApprovals}
						</DetailSheetProperty>
						<DetailSheetProperty label="Source receipts">
							{campaign.counts.sourceReceipts}
						</DetailSheetProperty>
						<DetailSheetProperty label="Attribution">
							{campaign.counts.attributionCredits}
						</DetailSheetProperty>
					</DetailSheetProperties>
				</DetailSheetSection>
				<DetailSheetSection title="Disabled execution">
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap gap-2">
							<Button type="button" size="sm" disabled>
								Publish disabled
							</Button>
							<Button type="button" size="sm" variant="outline" disabled>
								Social mutation disabled
							</Button>
							<Button type="button" size="sm" variant="outline" disabled>
								Ad spend disabled
							</Button>
						</div>
						{campaign.disabledReasons.map((reason) => (
							<DetailSheetProse key={reason}>{reason}</DetailSheetProse>
						))}
					</div>
				</DetailSheetSection>
				<DetailSheetSection
					title="Work"
					action={
						<Button asChild variant="outline" size="xs">
							<Link href={workspaceUrl("/work?queue=marketing")}>
								Open queue
							</Link>
						</Button>
					}
				>
					{campaign.work.length === 0 ? (
						<DetailSheetProse>No marketing work recorded.</DetailSheetProse>
					) : (
						<div className="flex flex-col gap-1">
							{campaign.work.map((work) => (
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
				<DetailSheetSection title="Content calendar">
					{nextPublication ? (
						<div className="flex flex-col gap-2">
							<div className="flex flex-wrap gap-2">
								<StatusIndicator
									tone={PUBLICATION_TONES[nextPublication.status] ?? "neutral"}
									label={label(nextPublication.status)}
									size="sm"
								/>
								<Badge variant="outline">{nextPublication.channel}</Badge>
								<Badge variant="outline">{nextPublication.provider}</Badge>
							</div>
							<DetailSheetProperties columns={1}>
								<DetailSheetProperty label="Scheduled" wide>
									{nextPublication.scheduledAt ? (
										<LocalRelativeTime date={nextPublication.scheduledAt} />
									) : (
										"Unscheduled"
									)}
								</DetailSheetProperty>
								<DetailSheetProperty label="Approval" wide>
									{nextPublication.approvalRequestId ?? "No approval"}
								</DetailSheetProperty>
								<DetailSheetProperty label="Digest" wide>
									<span className="break-all">
										{nextPublication.contentDigest}
									</span>
								</DetailSheetProperty>
							</DetailSheetProperties>
						</div>
					) : (
						<DetailSheetProse>
							No publication proposal recorded.
						</DetailSheetProse>
					)}
				</DetailSheetSection>
				<DetailSheetSection title="Content variants">
					{primaryContent ? (
						<div className="flex flex-col gap-2">
							<DetailSheetProperties columns={1}>
								<DetailSheetProperty label="Title" wide>
									{primaryContent.title ?? "Untitled"}
								</DetailSheetProperty>
								<DetailSheetProperty label="Kind" wide>
									{primaryContent.kind}
								</DetailSheetProperty>
								<DetailSheetProperty label="Status" wide>
									{label(primaryContent.status)}
								</DetailSheetProperty>
							</DetailSheetProperties>
							{primaryContent.variants.map((variant) => (
								<div key={variant.id} className="flex min-w-0 flex-col gap-1">
									<div className="flex flex-wrap items-center gap-2 text-xs">
										<Badge variant="secondary">Variant {variant.key}</Badge>
										<Badge variant="outline">{variant.channel}</Badge>
										<StatusIndicator
											tone={variant.status === "DRAFT" ? "info" : "success"}
											label={label(variant.status)}
											size="sm"
										/>
									</div>
									<DetailSheetProse>{variant.content}</DetailSheetProse>
								</div>
							))}
						</div>
					) : (
						<DetailSheetProse>No content proposal recorded.</DetailSheetProse>
					)}
				</DetailSheetSection>
				<DetailSheetSection title="Approvals and receipts">
					<div className="flex flex-col gap-2">
						{campaign.approvals.map((approval) => (
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
						{campaign.receipts.map((receipt) => (
							<div key={receipt.id} className="flex items-center gap-2 text-xs">
								<StatusIndicator
									tone={receipt.status === "SUCCEEDED" ? "success" : "warning"}
									label={label(receipt.status)}
									size="sm"
								/>
								<span className="min-w-0 flex-1 truncate">
									{receipt.operationKey ?? "Receipt"}
								</span>
								<span className="text-muted-foreground tabular-nums">
									USD {receipt.costUsd ?? "0.000000"}
								</span>
							</div>
						))}
						{campaign.approvals.length === 0 &&
						campaign.receipts.length === 0 ? (
							<DetailSheetProse>
								No marketing approvals or receipts recorded.
							</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
				<DetailSheetSection title="Touchpoints and attribution">
					<div className="flex flex-col gap-2">
						{campaign.touchpoints.map((touchpoint) => (
							<div key={touchpoint.id} className="flex min-w-0 flex-col gap-1">
								<div className="flex items-center gap-2 text-xs">
									<Icon icon={Calendar} />
									<Badge variant="outline">{touchpoint.channel}</Badge>
									<span className="text-muted-foreground">
										<LocalRelativeTime date={touchpoint.occurredAt} />
									</span>
								</div>
								{touchpoint.attributionCredits.map((credit) => (
									<span
										key={credit.id}
										className="text-muted-foreground text-xs"
									>
										{label(credit.model)} credit {credit.credit}
									</span>
								))}
								<DetailSheetProse>
									{displayValue(touchpoint.metadata)}
								</DetailSheetProse>
							</div>
						))}
						{campaign.touchpoints.length === 0 ? (
							<DetailSheetProse>
								No attribution touchpoints recorded.
							</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
				<DetailSheetSection title="Source receipts">
					<div className="flex flex-col gap-2">
						{campaign.sourceReceipts.map((receipt) => (
							<div key={receipt.id} className="flex min-w-0 flex-col gap-1">
								<div className="flex items-center gap-2 text-xs">
									<Badge variant="secondary">{receipt.source}</Badge>
									<span className="min-w-0 truncate text-muted-foreground">
										{receipt.externalId}
									</span>
								</div>
								<span className="break-all text-muted-foreground text-xs">
									{receipt.contentHash}
								</span>
							</div>
						))}
						{campaign.sourceReceipts.length === 0 ? (
							<DetailSheetProse>No source receipts recorded.</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
			</DetailSheetBody>
		</>
	);
}
