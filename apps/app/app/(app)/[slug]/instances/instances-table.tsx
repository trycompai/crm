"use client";

import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import Building from "@carbon/icons-react/es/Building";
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
	instanceFocusHistory,
	toInstancesListInput,
} from "@/lib/instances-input";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { instancesSearchParams } from "./instances-search-params";

type InstanceProviderAccount = {
	id: string;
	provider: string;
	externalAccountId: string;
	displayName: string | null;
	status: string;
	createdAt: string;
	updatedAt: string;
};

type InstanceResource = {
	id: string;
	providerAccountId: string;
	provider: string;
	resourceType: string;
	externalId: string;
	name: string | null;
	status: string;
	observedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

type InstanceWork = {
	id: string;
	queue: string;
	state: string;
	urgency: string;
	reason: string;
	primaryAction: string;
	evidence: unknown;
	updatedAt: string;
};

type InstanceApproval = {
	id: string;
	action: string;
	status: string;
	risk: string;
	targetType: string;
	targetId: string;
	contentDigest: string;
	integrityValid: boolean;
	expiresAt: string;
	requestedAt: string;
};

type InstanceReceipt = {
	id: string;
	operationKey: string | null;
	status: string;
	provider: string;
	channel: string | null;
	costUsd: string | null;
	errorCode: string | null;
	errorMessage: string | null;
	providerOperationId: string | null;
	completedAt: string | null;
	createdAt: string;
};

type InstanceRow = {
	id: string;
	account: {
		id: string;
		name: string;
		status: string;
		company: { id: string; name: string; domain: string | null } | null;
	};
	key: string;
	name: string;
	environment: string;
	region: string | null;
	status: string;
	externalId: string | null;
	latestObservedState: {
		id: string;
		digest: string | null;
		status: string;
		source: string | null;
		observedAt: string;
		createdAt: string;
	} | null;
	latestDesiredRevision: {
		id: string;
		revision: number;
		digest: string;
		status: string;
		source: string | null;
		createdAt: string;
	} | null;
	providerAccounts: InstanceProviderAccount[];
	resources: InstanceResource[];
	desiredRevisions: Array<{
		id: string;
		revision: number;
		digest: string;
		status: string;
		source: string | null;
		createdAt: string;
	}>;
	observedStates: Array<{
		id: string;
		digest: string | null;
		status: string;
		source: string | null;
		observedAt: string;
		createdAt: string;
	}>;
	plans: Array<{
		id: string;
		preconditionDigest: string;
		contentDigest: string;
		status: string;
		approvalRequestId: string | null;
		summary: string | null;
		errorMessage: string | null;
		createdAt: string;
		updatedAt: string;
		steps: Array<{
			id: string;
			position: number;
			operation: string;
			provider: string | null;
			resourceType: string | null;
			resourceId: string | null;
			status: string;
			operationKey: string | null;
			errorMessage: string | null;
		}>;
	}>;
	commands: Array<{
		id: string;
		command: string;
		contentDigest: string;
		status: string;
		approvalRequestId: string | null;
		errorMessage: string | null;
		createdAt: string;
		updatedAt: string;
	}>;
	operations: Array<{
		id: string;
		providerAccountId: string;
		planStepId: string | null;
		controlCommandId: string | null;
		provider: string;
		operation: string;
		operationKey: string | null;
		status: string;
		externalId: string | null;
		attemptCount: number;
		errorCode: string | null;
		errorMessage: string | null;
		createdAt: string;
		updatedAt: string;
	}>;
	incidents: Array<{
		id: string;
		provider: string | null;
		severity: string;
		status: string;
		title: string;
		summary: string | null;
		detectedAt: string;
		resolvedAt: string | null;
	}>;
	usageSamples: Array<{
		id: string;
		provider: string | null;
		metric: string;
		quantity: string;
		unit: string;
		observedAt: string;
		source: string | null;
	}>;
	costLineItems: Array<{
		id: string;
		provider: string;
		category: string;
		description: string | null;
		quantity: string;
		unitCost: string;
		totalCost: string;
		currency: string;
		periodStart: string;
		periodEnd: string;
	}>;
	counts: {
		providerAccounts: number;
		resources: number;
		desiredRevisions: number;
		observedStates: number;
		plans: number;
		commands: number;
		operations: number;
		incidents: number;
		openIncidents: number;
		usageSamples: number;
		costLineItems: number;
		openWork: number;
		pendingApprovals: number;
	};
	safety: {
		readOnly: boolean;
		customerMutationDisabled: boolean;
		providerMutationDisabled: boolean;
		providerExecutionDisabled: boolean;
		modelExecutionDisabled: boolean;
		humanApprovalRequired: boolean;
		secretValuesHidden: boolean;
		requiredGaps: string[];
		disabledReasons: string[];
	};
	createdAt: string;
	updatedAt: string;
};

type InstanceDetail = InstanceRow & {
	work: InstanceWork[];
	approvals: InstanceApproval[];
	receipts: InstanceReceipt[];
	viewer: { role: string; isAdmin: boolean };
};

type InstancesListData = {
	rows: InstanceRow[];
	total: number;
	facetCounts: Record<string, Record<string, number>>;
};

const STATUS_TONES: Record<string, StatusTone> = {
	DISCOVERED: "info",
	UNMANAGED: "neutral",
	PROVISIONING: "warning",
	ACTIVE: "success",
	PAUSED: "warning",
	DECOMMISSIONED: "neutral",
	FAILED: "error",
};

const STATE_TONES: Record<string, StatusTone> = {
	CURRENT: "success",
	STALE: "warning",
	ERROR: "error",
	UNKNOWN: "neutral",
	SYNCING: "info",
	DRIFTED: "warning",
	FAILED: "error",
	OPEN: "warning",
	RESOLVED: "success",
	CLOSED: "neutral",
};

const STATUS_OPTIONS = Object.keys(STATUS_TONES).map((value) => ({
	value,
	label: label(value),
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

function columnsForInstances(
	onFocus: (id: string) => void,
): DataTableColumn<InstanceRow>[] {
	return [
		{
			id: "name",
			header: "Instance",
			sortable: true,
			hideable: false,
			width: "w-[30%]",
			cell: (row) => (
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2 min-w-0 max-w-full justify-start text-left font-medium"
					type="button"
					data-instance-focus={row.id}
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
			width: "w-[13%]",
			cell: (row) => (
				<StatusIndicator
					tone={STATUS_TONES[row.status] ?? "neutral"}
					label={label(row.status)}
					size="sm"
				/>
			),
		},
		{
			id: "account",
			header: "Customer",
			sortable: true,
			width: "w-[18%]",
			hideBelow: "md",
			cell: (row) => <span className="truncate">{row.account.name}</span>,
		},
		{
			id: "environment",
			header: "Env",
			sortable: true,
			width: "w-[10%]",
			hideBelow: "lg",
			cell: (row) => <Badge variant="outline">{row.environment}</Badge>,
		},
		{
			id: "resources",
			header: "Resources",
			width: "w-[10%]",
			hideBelow: "lg",
			cell: (row) => (
				<span className="tabular-nums">{row.counts.resources}</span>
			),
		},
		{
			id: "observed",
			header: "Observed",
			align: "right",
			width: "w-[19%]",
			cell: (row) =>
				row.latestObservedState ? (
					<span className="flex justify-end">
						<StatusIndicator
							tone={STATE_TONES[row.latestObservedState.status] ?? "neutral"}
							label={label(row.latestObservedState.status)}
							size="sm"
						/>
					</span>
				) : (
					<EmptyCellValue />
				),
		},
	];
}

export function InstancesTable() {
	const trpc = useTRPC();
	const { query, input: rawInput } = useTableQuery(instancesSearchParams);
	const [focusId, setFocusId] = useQueryState("instance", parseAsString);
	const input = toInstancesListInput(rawInput);
	const instances = useQuery({
		...trpc.instances.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});
	const focus = useCallback(
		(id: string) =>
			void setFocusId(id, { history: instanceFocusHistory(true) }),
		[setFocusId],
	);
	const closeFocus = useCallback(
		() => void setFocusId(null, { history: instanceFocusHistory(false) }),
		[setFocusId],
	);
	const columns = useMemo(() => columnsForInstances(focus), [focus]);
	const instancesData = instances.data as unknown as
		| InstancesListData
		| undefined;
	const facetCounts = instancesData?.facetCounts;
	const facets: DataTableFacet[] = [
		{
			id: "status",
			label: "Status",
			options: STATUS_OPTIONS.filter(
				(option) => (facetCounts?.status?.[option.value] ?? 0) > 0,
			),
		},
		{
			id: "environment",
			label: "Environment",
			options: facetOptions(facetCounts?.environment),
		},
		{
			id: "provider",
			label: "Provider",
			options: facetOptions(facetCounts?.provider),
		},
	];

	return (
		<>
			<DataTable
				query={query}
				search={
					<ListSearch
						placeholder="Search instances, customers or resources..."
						label="Search customer instances"
					/>
				}
				columns={columns}
				rows={instancesData?.rows ?? []}
				total={instancesData?.total ?? 0}
				facetCounts={facetCounts}
				facets={facets}
				getRowId={(row) => row.id}
				loading={instances.isFetching}
				onRowClick={(row) => focus(row.id)}
				empty={
					instances.isError
						? "Customer instances could not be loaded. Try again."
						: "No customer instances match this view."
				}
			/>
			<InstanceDetailSheet instanceId={focusId} onClose={closeFocus} />
		</>
	);
}

function InstanceDetailSheet({
	instanceId,
	onClose,
}: {
	instanceId: string | null;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const detail = useQuery({
		...trpc.instances.byId.queryOptions({ id: instanceId ?? "" }),
		enabled: instanceId !== null,
	});
	const instance = detail.data as unknown as InstanceDetail | undefined;
	return (
		<DetailSheet
			open={instanceId !== null}
			onOpenChange={(open) => !open && onClose()}
		>
			{!instance && detail.isPending ? (
				<DetailSheetEmpty
					icon={Building}
					title="Loading instance"
					description="The customer instance is being loaded."
				/>
			) : null}
			{!instance && detail.isError ? (
				<DetailSheetEmpty
					icon={WarningAlt}
					title="Instance unavailable"
					description="The instance command centre could not load this record."
					action={
						<Button type="button" onClick={() => void detail.refetch()}>
							Retry
						</Button>
					}
				/>
			) : null}
			{instance ? (
				<InstanceDetailView
					instance={instance}
					workspaceUrl={workspaceUrl}
					onClose={onClose}
				/>
			) : null}
		</DetailSheet>
	);
}

function InstanceDetailView({
	instance,
	workspaceUrl,
	onClose,
}: {
	instance: InstanceDetail;
	workspaceUrl: (path?: string) => string;
	onClose: () => void;
}) {
	return (
		<>
			<DetailSheetHeader
				title={instance.name}
				description={`${instance.account.name} · ${instance.environment}`}
				note={
					<>
						<StatusIndicator
							tone={STATUS_TONES[instance.status] ?? "neutral"}
							label={label(instance.status)}
							size="sm"
						/>
						{instance.latestObservedState ? (
							<StatusIndicator
								tone={
									STATE_TONES[instance.latestObservedState.status] ?? "neutral"
								}
								label={label(instance.latestObservedState.status)}
								size="sm"
							/>
						) : null}
					</>
				}
				onClose={onClose}
			/>
			<DetailSheetBody>
				<DetailSheetSection title="Safety">
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap gap-2">
							<Button type="button" size="sm" disabled>
								Provider execution disabled
							</Button>
							<Button type="button" size="sm" variant="outline" disabled>
								Customer mutation disabled
							</Button>
							<Button type="button" size="sm" variant="outline" disabled>
								Secret values hidden
							</Button>
						</div>
						{instance.safety.disabledReasons.map((reason) => (
							<DetailSheetProse key={reason}>{reason}</DetailSheetProse>
						))}
					</div>
				</DetailSheetSection>
				<DetailSheetSection title="Readiness">
					<DetailSheetProperties>
						<DetailSheetProperty label="Provider accounts">
							{instance.counts.providerAccounts}
						</DetailSheetProperty>
						<DetailSheetProperty label="Resources">
							{instance.counts.resources}
						</DetailSheetProperty>
						<DetailSheetProperty label="Open incidents">
							{instance.counts.openIncidents}
						</DetailSheetProperty>
						<DetailSheetProperty label="Open work">
							{instance.counts.openWork}
						</DetailSheetProperty>
						<DetailSheetProperty label="Approvals">
							{instance.counts.pendingApprovals}
						</DetailSheetProperty>
						<DetailSheetProperty label="Region">
							{instance.region ?? "Unassigned"}
						</DetailSheetProperty>
					</DetailSheetProperties>
					{instance.safety.requiredGaps.length > 0 ? (
						<div className="mt-2 flex flex-wrap gap-2">
							{instance.safety.requiredGaps.map((gap) => (
								<Badge key={gap} variant="secondary">
									{label(gap)}
								</Badge>
							))}
						</div>
					) : null}
				</DetailSheetSection>
				<DetailSheetSection
					title="Work"
					action={
						<Button asChild variant="outline" size="xs">
							<Link href={workspaceUrl("/work?queue=instances")}>
								Open queue
							</Link>
						</Button>
					}
				>
					{instance.work.length === 0 ? (
						<DetailSheetProse>No instance work recorded.</DetailSheetProse>
					) : (
						<div className="flex flex-col gap-1">
							{instance.work.map((work) => (
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
				<DetailSheetSection title="Observed and desired state">
					<DetailSheetProperties columns={1}>
						<DetailSheetProperty label="Latest observed" wide>
							{instance.latestObservedState ? (
								<span className="break-all">
									{label(instance.latestObservedState.status)} ·{" "}
									{instance.latestObservedState.digest ?? "no digest"}
								</span>
							) : (
								"No observed state"
							)}
						</DetailSheetProperty>
						<DetailSheetProperty label="Latest desired" wide>
							{instance.latestDesiredRevision ? (
								<span className="break-all">
									Revision {instance.latestDesiredRevision.revision} ·{" "}
									{label(instance.latestDesiredRevision.status)} ·{" "}
									{instance.latestDesiredRevision.digest}
								</span>
							) : (
								"No desired revision"
							)}
						</DetailSheetProperty>
					</DetailSheetProperties>
				</DetailSheetSection>
				<DetailSheetSection title="Providers and resources">
					<div className="flex flex-col gap-3">
						{instance.providerAccounts.map((account) => (
							<div key={account.id} className="flex min-w-0 flex-col gap-1">
								<div className="flex flex-wrap items-center gap-2 text-xs">
									<Badge variant="secondary">{account.provider}</Badge>
									<StatusIndicator
										tone={STATE_TONES[account.status] ?? "neutral"}
										label={label(account.status)}
										size="sm"
									/>
									<span className="min-w-0 truncate text-muted-foreground">
										{account.displayName ?? account.externalAccountId}
									</span>
								</div>
							</div>
						))}
						{instance.resources.slice(0, 12).map((resource) => (
							<div key={resource.id} className="flex min-w-0 flex-col gap-1">
								<div className="flex flex-wrap items-center gap-2 text-xs">
									<Badge variant="outline">{resource.provider}</Badge>
									<Badge variant="outline">{resource.resourceType}</Badge>
									<StatusIndicator
										tone={STATE_TONES[resource.status] ?? "neutral"}
										label={label(resource.status)}
										size="sm"
									/>
								</div>
								<span className="truncate text-muted-foreground text-xs">
									{resource.name ?? resource.externalId}
								</span>
							</div>
						))}
						{instance.providerAccounts.length === 0 &&
						instance.resources.length === 0 ? (
							<DetailSheetProse>
								No provider census has been recorded.
							</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
				<DetailSheetSection title="Dry-run plans">
					<div className="flex flex-col gap-2">
						{instance.plans.map((plan) => (
							<div key={plan.id} className="flex min-w-0 flex-col gap-1">
								<div className="flex flex-wrap items-center gap-2 text-xs">
									<StatusIndicator
										tone={STATE_TONES[plan.status] ?? "neutral"}
										label={label(plan.status)}
										size="sm"
									/>
									<span className="text-muted-foreground">
										{plan.steps.length} steps
									</span>
								</div>
								<DetailSheetProse>
									{plan.summary ?? "Dry-run plan proposal"}
								</DetailSheetProse>
							</div>
						))}
						{instance.plans.length === 0 ? (
							<DetailSheetProse>No dry-run plans recorded.</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
				<DetailSheetSection title="Commands, operations and receipts">
					<div className="flex flex-col gap-2">
						{instance.commands.map((command) => (
							<div key={command.id} className="flex items-center gap-2 text-xs">
								<StatusIndicator
									tone={STATE_TONES[command.status] ?? "neutral"}
									label={label(command.status)}
									size="sm"
								/>
								<span className="min-w-0 flex-1 truncate">
									{command.command}
								</span>
							</div>
						))}
						{instance.operations.map((operation) => (
							<div
								key={operation.id}
								className="flex items-center gap-2 text-xs"
							>
								<StatusIndicator
									tone={STATE_TONES[operation.status] ?? "neutral"}
									label={label(operation.status)}
									size="sm"
								/>
								<span className="min-w-0 flex-1 truncate">
									{operation.provider} · {operation.operation}
								</span>
							</div>
						))}
						{instance.receipts.map((receipt) => (
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
						{instance.commands.length === 0 &&
						instance.operations.length === 0 &&
						instance.receipts.length === 0 ? (
							<DetailSheetProse>
								No commands, provider operations or receipts recorded.
							</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
				<DetailSheetSection title="Approvals">
					<div className="flex flex-col gap-2">
						{instance.approvals.map((approval) => (
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
											{label(approval.status)} · {approval.risk} ·{" "}
											{approval.integrityValid ? "valid" : "invalid"}
										</span>
									</span>
									<Icon icon={ArrowRight} data-icon="inline-end" />
								</Link>
							</Button>
						))}
						{instance.approvals.length === 0 ? (
							<DetailSheetProse>
								No instance approvals recorded.
							</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
				<DetailSheetSection title="Incidents">
					<div className="flex flex-col gap-2">
						{instance.incidents.map((incident) => (
							<div key={incident.id} className="flex min-w-0 flex-col gap-1">
								<div className="flex items-center gap-2 text-xs">
									<StatusIndicator
										tone={STATE_TONES[incident.status] ?? "warning"}
										label={label(incident.status)}
										size="sm"
									/>
									<Badge variant="outline">{label(incident.severity)}</Badge>
								</div>
								<DetailSheetProse>
									{incident.title}
									{incident.summary ? ` ${incident.summary}` : ""}
								</DetailSheetProse>
							</div>
						))}
						{instance.incidents.length === 0 ? (
							<DetailSheetProse>
								No incident detail is available for this view.
							</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
				<DetailSheetSection title="Usage and cost">
					<div className="flex flex-col gap-2">
						{instance.usageSamples.map((sample) => (
							<div key={sample.id} className="flex items-center gap-2 text-xs">
								<Badge variant="outline">{sample.metric}</Badge>
								<span className="tabular-nums">
									{sample.quantity} {sample.unit}
								</span>
								<span className="text-muted-foreground">
									<LocalRelativeTime date={sample.observedAt} />
								</span>
							</div>
						))}
						{instance.costLineItems.map((cost) => (
							<div key={cost.id} className="flex items-center gap-2 text-xs">
								<Badge variant="secondary">{cost.provider}</Badge>
								<span className="min-w-0 flex-1 truncate">{cost.category}</span>
								<span className="tabular-nums">
									{cost.currency} {cost.totalCost}
								</span>
							</div>
						))}
						{instance.usageSamples.length === 0 &&
						instance.costLineItems.length === 0 ? (
							<DetailSheetProse>
								No usage or cost read model has been recorded.
							</DetailSheetProse>
						) : null}
					</div>
				</DetailSheetSection>
			</DetailSheetBody>
		</>
	);
}
