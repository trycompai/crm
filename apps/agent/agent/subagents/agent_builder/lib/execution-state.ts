import { defineState } from "eve/context";

type BuilderAction = {
	callId: string;
	kind: string;
	toolName?: string;
};

type BuilderExecutionState = {
	turnId: string | null;
	callIds: string[];
	saveCallIds: string[];
	saved: boolean;
};

export const builderExecutionState = defineState<BuilderExecutionState>(
	"crm.agent-builder.execution",
	() => ({ turnId: null, callIds: [], saveCallIds: [], saved: false }),
);

export function recordBuilderActions(
	state: BuilderExecutionState,
	turnId: string,
	actions: readonly BuilderAction[],
): BuilderExecutionState {
	const current =
		state.turnId === turnId
			? state
			: { turnId, callIds: [], saveCallIds: [], saved: false };
	const callIds = new Set(current.callIds);
	const saveCallIds = new Set(current.saveCallIds);

	for (const action of actions) {
		if (callIds.has(action.callId)) continue;
		if (current.saved && action.toolName !== "final_output") {
			throw new Error(
				"The draft is already saved. Return the saved draft now without calling another tool.",
			);
		}
		if (!current.saved && action.toolName === "final_output") {
			throw new Error("Save the draft before returning draft_ready.");
		}
		if (callIds.size >= 12) {
			throw new Error("The agent builder exceeded its tool-call budget.");
		}
		if (action.toolName === "save_agent_draft") {
			if (saveCallIds.size >= 2) {
				throw new Error("The agent builder exceeded its draft-save budget.");
			}
			saveCallIds.add(action.callId);
		}
		callIds.add(action.callId);
	}

	return {
		turnId,
		callIds: [...callIds],
		saveCallIds: [...saveCallIds],
		saved: current.saved,
	};
}

export function markBuilderDraftSaved(): void {
	builderExecutionState.update((state) => ({ ...state, saved: true }));
}

export function assertBuilderDraftOpen(): void {
	if (builderExecutionState.get().saved) {
		throw new Error(
			"The draft is already saved. Return the saved draft now without changing files.",
		);
	}
}
