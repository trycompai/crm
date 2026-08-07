import { defineHook } from "eve/hooks";
import {
	builderExecutionState,
	markBuilderDraftSaveFinished,
	recordBuilderActions,
} from "../lib/execution-state";

export default defineHook({
	events: {
		"actions.requested"(event) {
			const next = recordBuilderActions(
				builderExecutionState.get(),
				event.data.turnId,
				event.data.stepIndex,
				event.data.actions,
			);
			builderExecutionState.update(() => next);
		},
		"action.result"(event) {
			if (
				event.data.status !== "completed" &&
				event.data.result.kind === "tool-result" &&
				event.data.result.toolName === "save_agent_draft"
			) {
				markBuilderDraftSaveFinished(false);
			}
		},
	},
});
