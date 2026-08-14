import { z } from "zod";

export type EveStreamEvent = {
	type: string;
	data?: unknown;
};

const text = z.string().nullable().catch(null);

const identifier = z.string().min(1).nullable().catch(null);

export const eveTurnReference = z
	.object({ turnId: identifier })
	.catch({ turnId: null });

export type EveTurnReference = z.infer<typeof eveTurnReference>;

export const eveTurnFailure = z
	.object({ code: text, message: text })
	.catch({ code: null, message: null });

export type EveTurnFailure = z.infer<typeof eveTurnFailure>;

const eveRequestedAction = z
	.object({
		kind: text,
		name: text,
		subagentName: text,
		callId: text,
	})
	.catch({ kind: null, name: null, subagentName: null, callId: null });

export const eveRequestedActions = z
	.object({ actions: z.array(eveRequestedAction).catch([]) })
	.catch({ actions: [] });

export type EveRequestedActions = z.infer<typeof eveRequestedActions>;

const eveCallReference = z.object({ callId: text }).catch({ callId: null });

export const eveSettledAction = z
	.object({
		callId: text,
		result: eveCallReference,
		action: eveCallReference,
	})
	.catch({ callId: null, result: { callId: null }, action: { callId: null } });

export type EveSettledAction = z.infer<typeof eveSettledAction>;
