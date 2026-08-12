import { describe, expect, it } from "bun:test";
import {
	linkedInSearchQuery,
	linkedInSlugsFromResults,
	linkedInSlugsFromText,
} from "../agent/lib/linkedin-candidates";

describe("linkedInSlugsFromText", () => {
	it("extracts profile handles from mixed text", () => {
		expect(
			linkedInSlugsFromText(
				"See https://www.linkedin.com/in/tomi-okonkwo and linkedin.com/in/PaulaMarchetti/",
			),
		).toEqual(["tomi-okonkwo", "paulamarchetti"]);
	});

	it("deduplicates the same handle", () => {
		expect(
			linkedInSlugsFromText(
				"https://linkedin.com/in/jane-doe https://www.linkedin.com/in/jane-doe/",
			),
		).toEqual(["jane-doe"]);
	});

	it("ignores non-profile linkedin urls", () => {
		expect(
			linkedInSlugsFromText("https://www.linkedin.com/company/northwind"),
		).toEqual([]);
	});
});

describe("linkedInSlugsFromResults", () => {
	it("reads the result url and body text", () => {
		const slugs = linkedInSlugsFromResults([
			{
				url: "https://www.linkedin.com/in/tokonkwo",
				title: "Tomi Okonkwo",
				description: null,
				markdown: null,
			},
			{
				url: "https://example.com/blog",
				title: "Also mentioned",
				description: "Profile at linkedin.com/in/other-person",
				markdown: null,
			},
		]);

		expect(slugs).toEqual(["tokonkwo", "other-person"]);
	});
});

describe("linkedInSearchQuery", () => {
	it("scopes search to linkedin profiles with the company", () => {
		expect(linkedInSearchQuery("okonkwo", "Northwind")).toBe(
			"site:linkedin.com/in okonkwo Northwind",
		);
		expect(linkedInSearchQuery("marchetti", "Fernhill Bank")).toBe(
			'site:linkedin.com/in marchetti "Fernhill Bank"',
		);
	});
});
