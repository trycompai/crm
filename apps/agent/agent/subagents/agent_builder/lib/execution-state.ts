import { defineState } from "eve/context";

type BuilderAction = {
	callId: string;
	kind: string;
	toolName?: string;
};

type BuilderExecutionState = {
	turnId: string | null;
	stepIndex: number | null;
	callIds: string[];
	stepCallIds: string[];
	saveCallIds: string[];
	savePending: boolean;
	saved: boolean;
};

export const builderExecutionState = defineState<BuilderExecutionState>(
	"crm.agent-builder.execution",
	() => ({
		turnId: null,
		stepIndex: null,
		callIds: [],
		stepCallIds: [],
		saveCallIds: [],
		savePending: false,
		saved: false,
	}),
);

export function recordBuilderActions(
	state: BuilderExecutionState,
	turnId: string,
	stepIndex: number,
	actions: readonly BuilderAction[],
): BuilderExecutionState {
	const current =
		state.turnId === turnId
			? state
			: {
					turnId,
					stepIndex: null,
					callIds: [],
					stepCallIds: [],
					saveCallIds: [],
					savePending: false,
					saved: state.saved,
				};
	const callIds = new Set(current.callIds);
	const stepCallIds = new Set(
		current.stepIndex === stepIndex ? current.stepCallIds : [],
	);
	const saveCallIds = new Set(current.saveCallIds);
	let savePending = current.savePending;

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
		if (savePending) {
			throw new Error(
				"Wait for save_agent_draft to finish before calling another tool.",
			);
		}
		if (callIds.size >= 12) {
			throw new Error("The agent builder exceeded its tool-call budget.");
		}
		if (action.toolName === "save_agent_draft") {
			if (stepCallIds.size > 0) {
				throw new Error("Call save_agent_draft by itself in a model step.");
			}
			if (saveCallIds.size >= 2) {
				throw new Error("The agent builder exceeded its draft-save budget.");
			}
			saveCallIds.add(action.callId);
			savePending = true;
		}
		callIds.add(action.callId);
		stepCallIds.add(action.callId);
	}

	return {
		turnId,
		stepIndex,
		callIds: [...callIds],
		stepCallIds: [...stepCallIds],
		saveCallIds: [...saveCallIds],
		savePending,
		saved: current.saved,
	};
}

export function finishBuilderDraftSave(
	state: BuilderExecutionState,
	saved: boolean,
): BuilderExecutionState {
	return { ...state, savePending: false, saved: state.saved || saved };
}

export function markBuilderDraftSaveFinished(saved: boolean): void {
	builderExecutionState.update((state) => finishBuilderDraftSave(state, saved));
}

export function assertBuilderDraftOpen(): void {
	if (builderExecutionState.get().saved) {
		throw new Error(
			"The draft is already saved. Return the saved draft now without changing files.",
		);
	}
}
