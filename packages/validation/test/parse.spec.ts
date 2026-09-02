import { describe, expect, it } from "bun:test";
import * as z from "zod";
import { InvalidInput, parse, schemas } from "../src/index";

const person = z.object({
	name: z.string().trim().min(1),
	age: z.number().int().min(0),
});

describe("parse", () => {
	it("returns the parsed value", () => {
		expect(parse(person, { name: "Grim", age: 30 }, "This person")).toEqual({
			name: "Grim",
			age: 30,
		});
	});

	it("names the subject and the field that failed", () => {
		expect(() => parse(person, { name: "", age: 30 }, "This person")).toThrow(
			InvalidInput,
		);

		try {
			parse(person, { name: "", age: 30 }, "This person");
		} catch (error) {
			expect((error as Error).message).toContain("This person");
			expect((error as Error).message).toContain("name");
		}
	});

	it("reports its own name, so a log tells it from an Error", () => {
		const error = new InvalidInput("bad");

		expect(error.name).toBe("InvalidInput");
		expect(error).toBeInstanceOf(Error);
	});
});

describe("the input request schema", () => {
	const request = {
		kind: "question",
		requestId: "req-1",
		action: {
			kind: "tool-call",
			callId: "call-1",
			toolName: "ask",
			input: {},
		},
	};

	it("takes a real prompt", () => {
		expect(
			schemas.agents.inputRequest.safeParse({
				...request,
				prompt: "Which one?",
			}).success,
		).toBe(true);
	});

	it("refuses a prompt that is only whitespace", () => {
		expect(
			schemas.agents.inputRequest.safeParse({ ...request, prompt: "   " })
				.success,
		).toBe(false);
	});
});

describe("the capabilities destination", () => {
	const chosen = {
		type: "slack.message.post",
		provider: "slack",
		summary: "Tell sales",
		destination: {
			kind: "channel" as const,
			resolution: "chosen" as const,
			id: "C123",
			label: "#sales",
		},
	};

	it("parses a chosen destination", () => {
		expect(schemas.agents.capabilityAction.safeParse(chosen).success).toBe(
			true,
		);
	});

	it("parses a run-channel destination", () => {
		expect(
			schemas.agents.capabilityAction.safeParse({
				...chosen,
				destination: { kind: "channel", resolution: "run-channel" },
			}).success,
		).toBe(true);
	});

	it("refuses a chosen destination without resolution", () => {
		expect(
			schemas.agents.capabilityAction.safeParse({
				...chosen,
				destination: { kind: "channel", id: "C123", label: "#sales" },
			}).success,
		).toBe(false);
	});
});
