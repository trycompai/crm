"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import Close from "@carbon/icons-react/es/Close";
import StopOutline from "@carbon/icons-react/es/StopOutline";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { CardPanel } from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

type Approval = {
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
type Operation = "approve" | "reject" | "invalidate";

function snapshotText(snapshot: unknown): string {
	try {
		return JSON.stringify(snapshot, null, 2) ?? "null";
	} catch {
		return "Unable to display this snapshot.";
	}
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : "The approval action failed.";
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
	const [resultMessage, setResultMessage] = useState("");
	const [errorMessage, setErrorMessage] = useState("");

	const refresh = async () => {
		if (approvalId) await cache.approval(approvalId);
	};

	const handleSuccess = async (operation: Operation, receiptId: string) => {
		setErrorMessage("");
		setResultMessage(
			`${operationLabel(operation)} recorded. Receipt ${receiptId}.`,
		);
		await refresh();
	};
	const handleError = async (error: unknown) => {
		setResultMessage("");
		setErrorMessage(errorText(error));
		await refresh();
	};

	const approve = useMutation(
		trpc.approval.approve.mutationOptions({
			onSuccess: (result) => handleSuccess("approve", result.receipt.id),
			onError: handleError,
		}),
	);
	const reject = useMutation(
		trpc.approval.reject.mutationOptions({
			onSuccess: (result) => handleSuccess("reject", result.receipt.id),
			onError: handleError,
		}),
	);
	const invalidate = useMutation(
		trpc.approval.invalidate.mutationOptions({
			onSuccess: (result) => handleSuccess("invalidate", result.receipt.id),
			onError: handleError,
		}),
	);
	const pending = approve.isPending || reject.isPending || invalidate.isPending;

	const submit = (operation: Operation) => {
		const current = approval.data;
		if (!current?.integrityValid || errorMessage || pending) return;
		if (!current) return;
		const input = {
			id: current.id,
			expectedVersion: current.version,
			contentDigest: current.contentDigest,
			invalidationVersion: current.invalidationVersion,
			clientRequestId: crypto.randomUUID(),
		};
		if (operation === "approve") approve.mutate(input);
		if (operation === "reject") reject.mutate(input);
		if (operation === "invalidate") invalidate.mutate(input);
	};

	return (
		<DetailSheet
			open={approvalId !== null}
			onOpenChange={(open) => !open && onClose()}
		>
			{approval.isPending ? (
				<DetailSheetEmpty
					icon={Checkmark}
					title="Loading approval"
					description="The exact approval snapshot is loading."
				/>
			) : approval.isError || !approval.data ? (
				<DetailSheetEmpty
					icon={WarningAlt}
					title="Approval unavailable"
					description="This approval could not be loaded or is no longer available."
				/>
			) : (
				<ApprovalFocus
					approval={approval.data}
					pending={pending}
					resultMessage={resultMessage}
					errorMessage={errorMessage}
					onAction={submit}
					onClose={onClose}
				/>
			)}
		</DetailSheet>
	);
}

function ApprovalFocus({
	approval,
	pending,
	resultMessage,
	errorMessage,
	onAction,
	onClose,
}: {
	approval: Approval;
	pending: boolean;
	resultMessage: string;
	errorMessage: string;
	onAction: (operation: Operation) => void;
	onClose: () => void;
}) {
	const canReview = approval.integrityValid && !errorMessage;
	const statusTone: StatusTone = approval.integrityValid ? "success" : "error";
	return (
		<>
			<DetailSheetHeader
				title={approval.action}
				description={approval.target.label ?? approval.target.id}
				note={
					<StatusIndicator
						tone={statusTone}
						label={
							approval.integrityValid
								? "Integrity verified"
								: "Integrity failed"
						}
						size="sm"
					/>
				}
				onClose={onClose}
			/>
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
						{errorMessage}
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
						<span className="break-all font-mono">
							{approval.contentDigest}
						</span>
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
		</>
	);
}

function operationLabel(operation: Operation): string {
	return operation === "approve"
		? "Approval"
		: operation === "reject"
			? "Rejection"
			: "Invalidation";
}
