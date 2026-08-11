"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Close from "@carbon/icons-react/es/Close";
import StopOutline from "@carbon/icons-react/es/StopOutline";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { CardPanel } from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
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
import { LocalDateTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	type ApprovalActionError,
	type ApprovalActionIntent,
	type ApprovalIntentSnapshot,
	type ApprovalOperation,
	approvalIntentAfterError,
	canRetryApprovalIntent,
	classifyApprovalActionError,
	createApprovalIntent,
	retryApprovalIntent,
} from "./approval-action-intent";

export type Approval = {
	id: string;
	action: string;
	contentSnapshot?: unknown;
	contentDigest: string;
	target: { id: string; type: string; label: string | null };
	risk: string;
	policyVersion: string;
	expiresAt: string;
	invalidationVersion: number;
	version: number;
	status: string;
	integrityValid: boolean;
	viewer: {
		canApprove: boolean;
		canReject: boolean;
		canInvalidate: boolean;
	};
};
function snapshotText(snapshot: unknown): string {
	try {
		return JSON.stringify(snapshot, null, 2) ?? "null";
	} catch {
		return "Unable to display this snapshot.";
	}
}

export function ApprovalFocusSheet({
	approvalId,
	onClose,
}: {
	approvalId: string | null;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const approval = useQuery({
		...trpc.approval.detail.queryOptions({ id: approvalId ?? "" }),
		enabled: approvalId !== null,
	});
	const intent = useRef<ApprovalActionIntent | null>(null);
	const [resultMessage, setResultMessage] = useState("");
	const [actionError, setActionError] = useState<ApprovalActionError | null>(
		null,
	);

	const refresh = async () => {
		if (approvalId) await cache.approval(approvalId);
	};

	const handleSuccess = async (
		operation: ApprovalOperation,
		receiptId: string,
	) => {
		intent.current = null;
		setActionError(null);
		setResultMessage(
			`${operationLabel(operation)} recorded. Receipt ${receiptId}.`,
		);
		await refresh();
	};
	const handleError = async (operation: ApprovalOperation, error: unknown) => {
		const failure = classifyApprovalActionError(error);
		intent.current = approvalIntentAfterError(intent.current, failure);
		setResultMessage("");
		setActionError({ operation, ...failure });
		await refresh();
	};

	const approve = useMutation(
		trpc.approval.approve.mutationOptions({
			onSuccess: (result) => handleSuccess("approve", result.receipt.id),
			onError: (error) => handleError("approve", error),
		}),
	);
	const reject = useMutation(
		trpc.approval.reject.mutationOptions({
			onSuccess: (result) => handleSuccess("reject", result.receipt.id),
			onError: (error) => handleError("reject", error),
		}),
	);
	const invalidate = useMutation(
		trpc.approval.invalidate.mutationOptions({
			onSuccess: (result) => handleSuccess("invalidate", result.receipt.id),
			onError: (error) => handleError("invalidate", error),
		}),
	);
	const pending = approve.isPending || reject.isPending || invalidate.isPending;

	const send = (nextIntent: ApprovalActionIntent) => {
		const input = retryApprovalIntent(nextIntent);
		if (!input) return;
		if (nextIntent.operation === "approve") approve.mutate(input);
		if (nextIntent.operation === "reject") reject.mutate(input);
		if (nextIntent.operation === "invalidate") invalidate.mutate(input);
	};

	const submit = (operation: ApprovalOperation) => {
		const current = approval.data;
		if (
			!current?.integrityValid ||
			approval.isError ||
			approval.isFetching ||
			pending
		) {
			return;
		}
		if (!current) return;
		const snapshot: ApprovalIntentSnapshot = {
			id: current.id,
			version: current.version,
			contentDigest: current.contentDigest,
			invalidationVersion: current.invalidationVersion,
		};
		const nextIntent = createApprovalIntent(operation, snapshot);
		intent.current = nextIntent;
		send(nextIntent);
	};

	const retry = () => {
		if (
			!approval.data?.integrityValid ||
			approval.isError ||
			approval.isFetching ||
			pending ||
			!actionError?.retryable ||
			!intent.current ||
			intent.current.operation !== actionError.operation
		) {
			return;
		}
		send(intent.current);
	};

	return (
		<DetailSheet
			open={approvalId !== null}
			onOpenChange={(open) => !open && onClose()}
		>
			{approval.isPending && !approval.data ? (
				<DetailSheetEmpty
					icon={Checkmark}
					title="Loading approval"
					description="The exact approval snapshot is loading."
				/>
			) : !approval.data ? (
				<DetailSheetEmpty
					icon={WarningAlt}
					title="Approval unavailable"
					description="This approval could not be loaded or is no longer available."
				/>
			) : (
				<>
					<ApprovalFocusHeader approval={approval.data} onClose={onClose} />
					<ApprovalFocus
						approval={approval.data}
						detailReady={!approval.isError && !approval.isFetching}
						pending={pending}
						resultMessage={resultMessage}
						actionError={actionError}
						intent={intent.current}
						onAction={submit}
						onRetry={retry}
					/>
				</>
			)}
		</DetailSheet>
	);
}

function ApprovalFocusHeader({
	approval,
	onClose,
}: {
	approval: Approval;
	onClose: () => void;
}) {
	return (
		<DetailSheetHeader
			title={approval.action}
			description={approval.target.label ?? approval.target.id}
			note={
				<StatusIndicator
					tone={approval.integrityValid ? "success" : "error"}
					label={
						approval.integrityValid ? "Integrity verified" : "Integrity failed"
					}
					size="sm"
				/>
			}
			onClose={onClose}
		/>
	);
}

export function ApprovalFocus({
	approval,
	detailReady,
	pending,
	resultMessage,
	actionError,
	intent,
	onAction,
	onRetry,
}: {
	approval: Approval;
	detailReady: boolean;
	pending: boolean;
	resultMessage: string;
	actionError: ApprovalActionError | null;
	intent: ApprovalActionIntent | null;
	onAction: (operation: ApprovalOperation) => void;
	onRetry: () => void;
}) {
	const canReview = approval.integrityValid && detailReady;
	const retryOperation = actionError?.retryable ? actionError.operation : null;
	const canRetry = canRetryApprovalIntent(
		intent,
		actionError,
		detailReady,
		approval.integrityValid,
	);
	return (
		<DetailSheetBody>
			<DetailSheetSection title="Decision">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="outline">{approval.status}</Badge>
					<Badge variant="outline">{approval.risk}</Badge>
					{approval.viewer.canApprove ? (
						<Button
							type="button"
							disabled={pending || !canReview}
							onClick={() => onAction("approve")}
						>
							<Icon icon={Checkmark} data-icon="inline-start" />
							Approve
						</Button>
					) : null}
					{approval.viewer.canReject ? (
						<Button
							type="button"
							variant="outline"
							disabled={pending || !canReview}
							onClick={() => onAction("reject")}
						>
							<Icon icon={Close} data-icon="inline-start" />
							Reject
						</Button>
					) : null}
					{approval.viewer.canInvalidate ? (
						<Button
							type="button"
							variant="destructive"
							disabled={pending || !canReview}
							onClick={() => onAction("invalidate")}
						>
							<Icon icon={StopOutline} data-icon="inline-start" />
							Invalidate
						</Button>
					) : null}
					{canRetry ? (
						<Button
							type="button"
							variant="outline"
							disabled={pending}
							onClick={onRetry}
						>
							Retry {retryOperation ? operationLabel(retryOperation) : null}
						</Button>
					) : null}
				</div>
				{!approval.integrityValid ? (
					<DetailSheetProse>
						This snapshot failed integrity verification. Review is disabled
						until the server supplies a valid approval.
					</DetailSheetProse>
				) : null}
				<div aria-live="polite" role="status">
					{resultMessage}
				</div>
				<div aria-live="assertive" role="alert">
					{actionError?.message}
				</div>
			</DetailSheetSection>
			<DetailSheetSection title="Target and expiry">
				<DetailSheetProperties>
					<DetailSheetProperty label="Target">
						{approval.target.label ?? approval.target.id}
					</DetailSheetProperty>
					<DetailSheetProperty label="Target type">
						{approval.target.type}
					</DetailSheetProperty>
					<DetailSheetProperty label="Expires">
						<LocalDateTime
							date={approval.expiresAt}
							options={{ dateStyle: "medium", timeStyle: "short" }}
						/>
					</DetailSheetProperty>
					<DetailSheetProperty label="Policy">
						{approval.policyVersion}
					</DetailSheetProperty>
				</DetailSheetProperties>
			</DetailSheetSection>
			<DetailSheetSection title="Digest">
				<DetailSheetProse>
					<span className="break-all font-mono">{approval.contentDigest}</span>
				</DetailSheetProse>
			</DetailSheetSection>
			<DetailSheetSection title="Exact snapshot">
				<CardPanel className="overflow-x-auto">
					<pre className="whitespace-pre-wrap break-words font-mono text-xs/5">
						{snapshotText(approval.contentSnapshot)}
					</pre>
				</CardPanel>
			</DetailSheetSection>
		</DetailSheetBody>
	);
}

function operationLabel(operation: ApprovalOperation): string {
	return operation === "approve"
		? "Approval"
		: operation === "reject"
			? "Rejection"
			: "Invalidation";
}
