export type ApprovalOperation = "approve" | "reject" | "invalidate";

export type ApprovalIntentSnapshot = {
	id: string;
	version: number;
	contentDigest: string;
	invalidationVersion: number;
};

export type ApprovalActionIntent = {
	operation: ApprovalOperation;
	fingerprint: string;
	clientRequestId: string;
};

export type ApprovalActionError = {
	operation: ApprovalOperation;
	message: string;
	retryable: boolean;
};

export function approvalIntentFingerprint(
	operation: ApprovalOperation,
	snapshot: ApprovalIntentSnapshot,
): string {
	return JSON.stringify([
		operation,
		snapshot.id,
		snapshot.version,
		snapshot.contentDigest,
		snapshot.invalidationVersion,
	]);
}

export function createApprovalIntent(
	operation: ApprovalOperation,
	snapshot: ApprovalIntentSnapshot,
	previous: ApprovalActionIntent | null,
	createRequestId: () => string = () => crypto.randomUUID(),
): ApprovalActionIntent {
	const fingerprint = approvalIntentFingerprint(operation, snapshot);
	if (previous?.fingerprint === fingerprint) return previous;
	return { operation, fingerprint, clientRequestId: createRequestId() };
}

export function approvalIntentAfterError(
	intent: ApprovalActionIntent | null,
	failure: Pick<ApprovalActionError, "retryable">,
): ApprovalActionIntent | null {
	return failure.retryable ? intent : null;
}

export function classifyApprovalActionError(error: unknown): {
	message: string;
	retryable: boolean;
} {
	const data =
		error && typeof error === "object" && "data" in error ? error.data : null;
	const code =
		data && typeof data === "object" && "code" in data ? data.code : undefined;
	const httpStatus =
		data && typeof data === "object" && "httpStatus" in data
			? data.httpStatus
			: undefined;
	const retryable =
		(typeof httpStatus === "number" && httpStatus >= 500) ||
		code === "INTERNAL_SERVER_ERROR" ||
		(typeof code !== "string" && typeof httpStatus !== "number");
	const message =
		error instanceof Error ? error.message : "The approval action failed.";
	return { message, retryable };
}
