import { describe, expect, it } from "bun:test";
import { builderQuestion } from "../src/builder-question";

const action = {
	kind: "tool-call",
	callId: "call-1",
	toolName: "ask_question",
	input: {},
};

describe("builderQuestion", () => {
	it("reads a clarification question", () => {
		expect(
			builderQuestion.parse({
				kind: "question",
				requestId: "q1",
				prompt: "Which channel?",
				action,
				display: "select",
				options: [{ id: "C1", label: "#sales" }],
			}),
		).toEqual({
			kind: "question",
			requestId: "q1",
			prompt: "Which channel?",
			display: "select",
			options: [{ id: "C1", label: "#sales" }],
			allowFreeform: false,
		});
	});

	it("reads a session-limit prompt, so a budget stop reaches the user", () => {
		const parsed = builderQuestion.parse({
			kind: "session-limit",
			requestId: "child:limit:output:10238",
			prompt: "This session has hit the output-token limit (10K) per session.",
			action: { ...action, toolName: "session_limit_continuation" },
			display: "confirmation",
			allowFreeform: false,
			options: [
				{ id: "continue", label: "Approve", style: "primary" },
				{ id: "stop", label: "Stop", style: "danger" },
			],
		});

		expect(parsed?.kind).toBe("session-limit");
		expect(parsed?.options.map((option) => option.id)).toEqual([
			"continue",
			"stop",
		]);
		expect(parsed?.allowFreeform).toBe(false);
	});

	it("reads a tool-approval prompt", () => {
		expect(
			builderQuestion.parse({
				kind: "tool-approval",
				requestId: "a1",
				prompt: "Save this draft?",
				action: { ...action, toolName: "save_agent_draft" },
				display: "confirmation",
				options: [{ id: "approve", label: "Approve" }],
			})?.kind,
		).toBe("tool-approval");
	});

	it("reads an unknown kind as no question rather than throwing", () => {
		expect(
			builderQuestion.parse({
				kind: "something-new",
				requestId: "x1",
				prompt: "?",
				action,
			}),
		).toBeNull();
	});

	it("reads a missing request as no question", () => {
		expect(builderQuestion.parse(null)).toBeNull();
	});
});
