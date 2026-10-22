import { describe, expect, it } from "bun:test";
import {
	buildImportRows,
	createInitialMapping,
	parseCsv,
	reduceImportWizard,
} from "./csv-import";

describe("company CSV parsing", () => {
	it("parses quoted commas, escaped quotes, and quoted line breaks", () => {
		expect(
			parseCsv(
				'name,website,description\r\n"Acme, Inc.",https://acme.test,"A ""quoted""\nsummary"',
			),
		).toEqual({
			headers: ["name", "website", "description"],
			rows: [["Acme, Inc.", "https://acme.test", 'A "quoted"\nsummary']],
		});
	});

	it("rejects files without headers or company rows", () => {
		expect(() => parseCsv("\n\n")).toThrow("The CSV file has no headers.");
		expect(() => parseCsv("name,website\n")).toThrow(
			"The CSV file has no company rows.",
		);
	});

	it("rejects malformed rows and unterminated quoted fields", () => {
		expect(() => parseCsv("name,website\nAcme,acme.test,extra")).toThrow(
			"Row 2 has 3 columns. The header has 2.",
		);
		expect(() => parseCsv('name\n"Acme')).toThrow(
			"Row 2 has an unterminated quoted field.",
		);
	});

	it("keeps blank lines so skipped row numbers match the source file", () => {
		expect(parseCsv("name,website\nAcme,acme.test\n,\nBeta,beta.test")).toEqual(
			{
				headers: ["name", "website"],
				rows: [
					["Acme", "acme.test"],
					["", ""],
					["Beta", "beta.test"],
				],
			},
		);
	});
});

describe("company CSV mapping", () => {
	it("keys repeated header labels by column index", () => {
		const parsed = parseCsv("name,name,website\nAcme,Alias,acme.test");
		const mapping = createInitialMapping(parsed.headers);

		expect(mapping).toEqual(["name", null, "website"]);
		expect(buildImportRows(parsed, mapping)).toEqual([
			{ name: "Acme", website: "acme.test" },
		]);
	});

	it("rejects duplicate destinations", () => {
		const parsed = parseCsv("company,account\nAcme,Alias");
		expect(() => buildImportRows(parsed, ["name", "name"])).toThrow(
			"Each company field can use only one CSV column.",
		);
	});
});

describe("company import wizard", () => {
	it("moves through mapping and results, then restores upload state", () => {
		const parsed = parseCsv("name,website\nAcme,acme.test");
		const mapping = createInitialMapping(parsed.headers);
		const mapped = reduceImportWizard(
			{ step: "upload", message: "" },
			{ type: "file-loaded", parsed, mapping },
		);
		const result = reduceImportWizard(mapped, {
			type: "import-finished",
			result: { created: 1, skipped: 0, skips: [] },
		});

		expect(mapped.step).toBe("map");
		expect(result.step).toBe("result");
		expect(reduceImportWizard(result, { type: "restart" })).toEqual({
			step: "upload",
			message: "Choose a CSV file.",
		});
	});

	it("keeps one destination when the user remaps a column", () => {
		const parsed = parseCsv("name,company website\nAcme,acme.test");
		const mapped = reduceImportWizard(
			{
				step: "map",
				message: "Map the CSV columns.",
				parsed,
				mapping: ["name", "website"],
			},
			{ type: "mapping-changed", column: 1, field: "name" },
		);

		expect(mapped.step).toBe("map");
		if (mapped.step === "map") expect(mapped.mapping).toEqual([null, "name"]);
	});
});
