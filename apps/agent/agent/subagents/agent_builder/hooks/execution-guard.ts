import { defineHook } from "eve/hooks";
import {
	builderExecutionState,
	recordBuilderActions,
} from "../lib/execution-state";

export default defineHook({
	events: {
		"actions.requested"(event) {
			const next = recordBuilderActions(
				builderExecutionState.get(),
				event.data.turnId,
				event.data.actions,
			);
			builderExecutionState.update(() => next);
		},
	},
});
