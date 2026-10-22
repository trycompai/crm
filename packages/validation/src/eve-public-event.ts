import { z } from "zod";

export const publicEveEventInput = z.json();
const json = publicEveEventInput;
const identifier = z.string().min(1).max(256);
const continuationToken = z.string().min(1).max(4_096);
const publicUrl = z
	.string()
	.max(4_096)
	.url()
	.refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
const renderableUrl = z
	.string()
	.max(1_048_576)
	.url()
	.refine((value) =>
		["data:", "http:", "https:"].includes(new URL(value).protocol),
	);
const eventPosition = {
	turnId: identifier.optional(),
	sequence: z.number().int().nonnegative().optional(),
	stepIndex: z.number().int().nonnegative().optional(),
};
const position = z.object(eventPosition);
const inputResponse = z.object({
	requestId: identifier,
	optionId: z.string().max(1_024).optional(),
	text: z.string().max(65_536).optional(),
});
const action = z.object({
	kind: z.enum([
		"tool-call",
		"load-skill",
		"subagent-call",
		"remote-agent-call",
		"workflow-tool-call",
	]),
	callId: identifier,
	parentCallId: identifier.optional(),
	toolName: z.string().max(512).optional(),
	name: z.string().max(512).optional(),
	subagentName: z.string().max(512).optional(),
	remoteAgentName: z.string().max(512).optional(),
	description: z.string().max(4_096).optional(),
	input: json,
});
const presentation = z.record(
	z.string(),
	z.object({ label: z.string().max(512).optional() }),
);
const inputRequest = z.object({
	requestId: identifier,
	kind: z.enum(["question", "session-limit", "tool-approval"]),
	action: z.object({
		kind: z.literal("tool-call"),
		callId: identifier,
		parentCallId: identifier.optional(),
		toolName: z.string().max(512),
		input: json,
	}),
	prompt: z.string().max(65_536),
	display: z.enum(["text", "select", "confirmation"]).optional(),
	allowFreeform: z.boolean().optional(),
	options: z
		.array(
			z.object({
				id: z.string().max(1_024),
				label: z.string().max(4_096),
				description: z.string().max(16_384).optional(),
				style: z.enum(["default", "primary", "danger"]).optional(),
			}),
		)
		.max(100)
		.optional(),
});
const toolResult = z.object({
	kind: z.enum(["tool-result", "load-skill-result", "subagent-result"]),
	callId: identifier,
	toolName: z.string().max(512).optional(),
	name: z.string().max(512).optional(),
	subagentName: z.string().max(512).optional(),
	output: json,
	isError: z.boolean().optional(),
});
const actionResult = z.object({
	...eventPosition,
	status: z.enum(["completed", "failed", "rejected"]),
	result: toolResult,
	presentation: presentation.optional(),
});
const taskSettled = z
	.object({
		turnId: identifier,
		callId: identifier,
		taskId: identifier,
		kind: z.enum(["agent", "tool"]).optional(),
		name: z.string().max(512).optional(),
		status: z.enum(["completed", "failed", "cancelled"]),
		output: json.optional(),
		cancel: z
			.object({
				reason: z.enum(["task_cancel", "turn_cancelled", "turn_ended"]),
			})
			.optional(),
		error: z.object({ message: z.string() }).optional(),
	})
	.transform((data) => {
		if (data.status === "completed") return data;
		const { error: _error, output: _output, ...safe } = data;
		return data.status === "failed"
			? {
					...safe,
					error: { message: "The agent could not complete this task." },
				}
			: safe;
	});
const messagePart = z.discriminatedUnion("type", [
	z.object({ type: z.literal("text"), text: z.string() }),
	z.object({
		type: z.literal("file"),
		filename: z.string().max(1_024).optional(),
		mediaType: z.string().max(512),
		size: z.number().int().nonnegative().optional(),
		url: renderableUrl.optional(),
	}),
]);
const authorization = z.object({
	url: publicUrl.optional(),
	userCode: z.string().max(1_024).optional(),
	expiresAt: z.iso.datetime().optional(),
	instructions: z.string().max(16_384).optional(),
	displayName: z.string().max(512).optional(),
});
const failureEvent = position.transform((data) => ({
	...data,
	code: "agent_error",
	message: "The agent could not complete this step.",
}));

const eventData = {
	"actions.requested": z.object({
		...eventPosition,
		actions: z.array(action).max(1_000),
		presentation: presentation.optional(),
	}),
	"action.input.appended": z.object({
		...eventPosition,
		callId: identifier,
		toolName: z.string().max(512),
		inputTextDelta: z.string(),
	}),
	"input.requested": z.object({
		...eventPosition,
		requests: z.array(inputRequest).max(100),
		taskId: identifier.optional(),
	}),
	"input.resolved": z.object({
		...eventPosition,
		resolutions: z.array(
			z.object({
				requestId: identifier,
				kind: z.enum(["question", "session-limit", "tool-approval"]),
				outcome: z.enum([
					"answered",
					"approved",
					"cancelled",
					"denied",
					"ignored",
					"invalid",
				]),
				response: inputResponse.optional(),
			}),
		),
	}),
	"approval.candidate": z.object({
		...eventPosition,
		requestId: identifier,
		candidateId: identifier,
		responderPrincipalId: identifier,
		outcome: z.enum(["pending", "rejected", "failed", "timed-out", "stale"]),
		reason: z.string().max(4_096).optional(),
	}),
	"approval.settled": z.object({
		...eventPosition,
		requestId: identifier,
		responderPrincipalId: identifier,
		outcome: z.enum(["approved", "cancelled"]),
	}),
	"action.partial": z
		.object({
			...eventPosition,
			result: toolResult,
			presentation: presentation.optional(),
		})
		.transform((data) =>
			data.result.isError
				? { ...data, result: { ...data.result, output: null } }
				: data,
		),
	"action.result": actionResult.transform((data) =>
		data.status === "completed"
			? data
			: {
					...data,
					result: { ...data.result, output: null },
					error: {
						code: "agent_error",
						message: "The agent could not complete this action.",
					},
				},
	),
	"session.started": position,
	"turn.started": position,
	"message.received": z.object({
		...eventPosition,
		message: z.string(),
		parts: z.array(messagePart).max(100).optional(),
	}),
	"message.appended": z.object({
		...eventPosition,
		messageDelta: z.string(),
	}),
	"message.completed": z.object({
		...eventPosition,
		message: z.string(),
		finishReason: z
			.enum([
				"stop",
				"length",
				"tool-calls",
				"content-filter",
				"error",
				"other",
			])
			.optional(),
	}),
	"reasoning.appended": z.object({
		...eventPosition,
		reasoningDelta: z.string(),
	}),
	"reasoning.completed": z.object({
		...eventPosition,
		reasoning: z.string(),
	}),
	"result.completed": z.object({ ...eventPosition, result: json }),
	"agent.started": z.object({
		turnId: identifier,
		callId: identifier,
		taskId: identifier.optional(),
		name: z.string().max(512),
		sessionId: identifier,
		streamPath: z.string().startsWith("/eve/v1/session/"),
	}),
	"task.started": z.object({
		turnId: identifier,
		callId: identifier,
		taskId: identifier,
		kind: z.enum(["agent", "tool"]),
		name: z.string().max(512),
	}),
	"task.settled": taskSettled,
	"authorization.required": z.object({
		...eventPosition,
		attemptId: identifier.optional(),
		candidateId: identifier.optional(),
		principalId: identifier.optional(),
		taskId: identifier.optional(),
		name: z.string().max(512),
		description: z.string().max(16_384),
		authorization: authorization.optional(),
	}),
	"authorization.completed": z.object({
		...eventPosition,
		attemptId: identifier.optional(),
		candidateId: identifier.optional(),
		principalId: identifier.optional(),
		taskId: identifier.optional(),
		name: z.string().max(512),
		outcome: z.enum(["authorized", "declined", "failed", "timed-out"]),
		reason: z.string().max(4_096).optional(),
		authorization: authorization.optional(),
	}),
	"turn.completed": position,
	"turn.cancelled": position,
	"turn.waiting": position,
	"session.waiting": z.object({
		continuationToken,
		wait: z.literal("next-user-message"),
	}),
	"session.completed": z.object({}),
	"step.started": position,
	"step.completed": position,
	"step.failed": failureEvent,
	"turn.failed": failureEvent,
	"session.failed": z
		.object({ sessionId: identifier.optional() })
		.transform((data) => ({
			...data,
			code: "agent_error",
			message: "The agent session failed.",
		})),
} satisfies Readonly<Record<string, z.ZodType>>;

export function publicEveEventData(type: string, data: unknown) {
	const schema = Object.entries(eventData).find(
		([eventType]) => eventType === type,
	)?.[1];
	const parsed = schema?.safeParse(data);
	return parsed?.success
		? { type, data: parsed.data }
		: { type: "event.ignored", data: {} };
}
