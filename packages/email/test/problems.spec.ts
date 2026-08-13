import { describe, expect, test } from "bun:test";
import { BLOCK_SHAPES, documentProblems } from "../src/document";

describe("telling an author what is wrong", () => {
	test("names the field when a text run is a bare string", () => {
		const problems = documentProblems({
			version: 1,
			blocks: [{ type: "text", text: "Hello" }],
		});

		expect(problems.length).toBeGreaterThan(0);
		expect(problems[0]?.path).toContain("blocks.0.text");
	});

	test("names the field when a button has no real url", () => {
		const problems = documentProblems({
			version: 1,
			blocks: [{ type: "button", label: "Read more", href: "https://" }],
		});

		expect(problems.some((problem) => problem.path.includes("href"))).toBe(
			true,
		);
	});

	test("says nothing about a document that parses", () => {
		expect(
			documentProblems({
				version: 1,
				blocks: [{ type: "text", text: [{ text: "Hello" }] }],
			}),
		).toEqual([]);
	});

	test("reports every issue, not the first eight", () => {
		const problems = documentProblems({
			version: 1,
			blocks: Array.from({ length: 12 }, () => ({
				type: "text",
				text: "Hello",
			})),
		});

		expect(problems.length).toBeGreaterThanOrEqual(12);
		expect(problems.some((problem) => problem.path.includes("blocks.11"))).toBe(
			true,
		);
	});

	test("the shapes it hands back are themselves readable", () => {
		expect(BLOCK_SHAPES.inline).toContain("ARRAY of runs");
		expect(BLOCK_SHAPES.text).toContain('"text": [{ "text"');
	});

	test("the shapes cover a columns block", () => {
		expect(BLOCK_SHAPES.columns).toContain('"type": "columns"');
		expect(BLOCK_SHAPES.columns).toContain("blocks");
	});
});
