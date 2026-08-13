import { describe, expect, test } from "bun:test";
import { autosaveKey } from "../src/hooks/use-autosave";

describe("what autosave decides to write", () => {
	test("a redrawn object with the same contents is not a change", () => {
		const first = { subject: "Hi", blocks: [{ type: "text" }] };
		const second = { subject: "Hi", blocks: [{ type: "text" }] };

		expect(first === second).toBe(false);
		expect(autosaveKey(first)).toBe(autosaveKey(second));
	});

	test("reordered properties are not a change", () => {
		expect(autosaveKey({ subject: "Hi", blocks: [] })).toBe(
			autosaveKey({ blocks: [], subject: "Hi" }),
		);
	});

	test("reordered properties inside a block are not a change", () => {
		expect(
			autosaveKey({ blocks: [{ type: "text", text: [{ text: "Hi" }] }] }),
		).toBe(autosaveKey({ blocks: [{ text: [{ text: "Hi" }], type: "text" }] }));
	});

	test("reordered blocks are a change", () => {
		expect(
			autosaveKey({ blocks: [{ type: "divider" }, { type: "text" }] }),
		).not.toBe(
			autosaveKey({ blocks: [{ type: "text" }, { type: "divider" }] }),
		);
	});

	test("an edited field is a change", () => {
		expect(autosaveKey({ subject: "Hi" })).not.toBe(
			autosaveKey({ subject: "Ho" }),
		);
	});

	test("an added block is a change", () => {
		expect(autosaveKey({ blocks: [] })).not.toBe(
			autosaveKey({ blocks: [{ type: "divider" }] }),
		);
	});

	test("undefined and null settle to the same key", () => {
		expect(autosaveKey(undefined)).toBe(autosaveKey(null));
	});
});
