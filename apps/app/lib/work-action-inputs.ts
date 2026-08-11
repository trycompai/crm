import type { RouterInputs } from "./trpc/types";

type WorkInputs = RouterInputs["work"];
export type WorkMutationBase = WorkInputs["claim"];

export function workMutationBase(
	id: string,
	expectedVersion: number,
	clientRequestId: string,
): WorkMutationBase {
	return { id, expectedVersion, clientRequestId };
}

export function workAssignInput(
	base: WorkMutationBase,
	assigneeId: string | null,
): WorkInputs["assign"] {
	return { ...base, assigneeId };
}

export function workWaitInput(
	base: WorkMutationBase,
	reason: string,
	nextReviewAt: string,
): WorkInputs["wait"] {
	return { ...base, reason, nextReviewAt };
}

export function workReasonInput(
	base: WorkMutationBase,
	reason: string,
): WorkInputs["block"] {
	return { ...base, reason };
}
