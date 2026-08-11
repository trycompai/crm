export type ApprovalOperation = "approve" | "reject" | "invalidate";

export type ApprovalIntentSnapshot = {
	id: string;
	version: number;
	contentDigest: string;
	invalidationVersion: number;
};

export type ApprovalMutationInput = Readonly<{
	id: string;
	expectedVersion: number;
	contentDigest: string;
	invalidationVersion: number;
	clientRequestId: string;
}>;

export type ApprovalActionIntent = {
	operation: ApprovalOperation;
	input: ApprovalMutationInput;
	fingerprint: string;
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
	createRequestId: () => string = () => crypto.randomUUID(),
): ApprovalActionIntent {
	const fingerprint = approvalIntentFingerprint(operation, snapshot);
	const input = Object.freeze({
		id: snapshot.id,
		expectedVersion: snapshot.version,
		contentDigest: snapshot.contentDigest,
		invalidationVersion: snapshot.invalidationVersion,
		clientRequestId: createRequestId(),
	});
	return { operation, input, fingerprint };
}

export function retryApprovalIntent(
	intent: ApprovalActionIntent | null,
): ApprovalMutationInput | null {
	return intent?.input ?? null;
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
