import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { setResearchKeyInput } from "../src/settings/settings.contracts";
import { readableInputError } from "../src/trpc/error-formatter";

const causeOf = (schema: z.ZodType, value: unknown) => {
	const result = schema.safeParse(value);
	if (result.success) throw new Error("expected the parse to fail");
	return result.error;
};

describe("what a rejected form says", () => {
	it("shows the sentence, not the ZodError", () => {
		const cause = causeOf(setResearchKeyInput, { apiKey: "short" });

		expect(readableInputError("ignored", cause)).toBe(
			"That does not look like a Context API key — it is too short.",
		);
	});

	it("never leaks the machinery a reader cannot act on", () => {
		const cause = causeOf(setResearchKeyInput, { apiKey: "short" });
		const shown = readableInputError("ignored", cause) ?? "";

		for (const noise of [
			"too_small",
			"minimum",
			"inclusive",
			"path",
			"[",
			"{",
		]) {
			expect(shown).not.toContain(noise);
		}
	});

	it("names the field when zod's own default says nothing", () => {
		const cause = causeOf(z.object({ website: z.string() }), {});

		expect(readableInputError("ignored", cause)).toContain("website");
	});

	it("joins several complaints into one line, without repeating itself", () => {
		const schema = z.object({
			a: z.string().min(3, "Too short."),
			b: z.string().min(3, "Too short."),
		});
		const cause = causeOf(schema, { a: "x", b: "y" });

		expect(readableInputError("ignored", cause)).toBe("Too short.");
	});

	it("leaves an error that is not a failed parse alone", () => {
		expect(readableInputError("Nope.", new Error("boom"))).toBeNull();
		expect(readableInputError("Nope.", undefined)).toBeNull();
		expect(readableInputError("Nope.", { issues: [] })).toBeNull();
	});
});
