export type WorkDialogState = {
	reason: string;
	nextReviewAt: string;
	assigneeId: string;
	assigneeSearch: string;
};

export function resetWorkDialogState(
	ownerId: string | null | undefined,
): WorkDialogState {
	return {
		reason: "",
		nextReviewAt: "",
		assigneeId: ownerId ?? "unassigned",
		assigneeSearch: "",
	};
}
