import { defineState } from "eve/context";

type BuilderDelegationAction = {
	callId: string;
	kind: string;
	subagentName?: string;
};

type BuilderDelegationState = {
	turnId: string | null;
	callIds: string[];
};

export const builderDelegationState = defineState<BuilderDelegationState>(
	"crm.builder-delegation",
	() => ({ turnId: null, callIds: [] }),
);

export function recordBuilderDelegation(
	state: BuilderDelegationState,
	turnId: string,
	actions: readonly BuilderDelegationAction[],
): BuilderDelegationState {
	const current =
		state.turnId === turnId ? state : { turnId, callIds: [] as string[] };
	const callIds = new Set(current.callIds);

	for (const action of actions) {
		if (
			action.kind !== "subagent-call" ||
			action.subagentName !== "agent_builder" ||
			callIds.has(action.callId)
		) {
			continue;
		}
		if (callIds.size > 0) {
			throw new Error(
				"The agent builder can be delegated only once per creation turn.",
			);
		}
		callIds.add(action.callId);
	}

	return { turnId, callIds: [...callIds] };
}
