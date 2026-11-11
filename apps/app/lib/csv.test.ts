import { describe, expect, it } from "bun:test";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
	it("parses a simple CSV with headers", () => {
		const result = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
		expect(result.headers).toEqual(["a", "b", "c"]);
		expect(result.rows).toEqual([
			{ a: "1", b: "2", c: "3" },
			{ a: "4", b: "5", c: "6" },
		]);
	});

	it("handles quoted fields with commas and newlines", () => {
		const csv = 'name,message\n"Ana","Hi, nice to meet you!\nSee you soon."\n';
		const result = parseCsv(csv);
		expect(result.rows).toEqual([
			{ name: "Ana", message: "Hi, nice to meet you!\nSee you soon." },
		]);
	});

	it("handles escaped quotes inside a quoted field", () => {
		const csv = 'label\n"she said ""hello"""\n';
		const result = parseCsv(csv);
		expect(result.rows).toEqual([{ label: 'she said "hello"' }]);
	});

	it("skips blank trailing rows", () => {
		const csv = "a,b\n1,2\n\n";
		const result = parseCsv(csv);
		expect(result.rows).toEqual([{ a: "1", b: "2" }]);
	});

	it("fills missing trailing cells with an empty string", () => {
		const csv = "a,b,c\n1,2\n";
		const result = parseCsv(csv);
		expect(result.rows).toEqual([{ a: "1", b: "2", c: "" }]);
	});

	it("returns empty headers and rows for empty input", () => {
		expect(parseCsv("")).toEqual({ headers: [], rows: [] });
	});
});
