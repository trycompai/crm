import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = () =>
	readFileSync(
		new URL("../components/data-table/list-search.tsx", import.meta.url),
		"utf8",
	);

describe("list search accessibility contract", () => {
	it("keeps an explicit label independent from the placeholder", () => {
		const component = source();

		expect(component).toContain('label = "Search records"');
		expect(component).toContain("aria-label={label}");
		expect(component).toContain("placeholder={placeholder}");
	});
});
