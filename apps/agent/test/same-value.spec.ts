import { describe, expect, it } from "bun:test";
import { canonicalValue, sameValue } from "../agent/lib/facts";

describe("sameValue", () => {
	it("ignores a trailing slash", () => {
		expect(
			sameValue(
				"https://www.linkedin.com/in/pogrebs",
				"https://www.linkedin.com/in/pogrebs/",
			),
		).toBe(true);
	});

	it("ignores www, the scheme and case", () => {
		expect(
			sameValue(
				"http://LinkedIn.com/in/Pogrebs/",
				"https://www.linkedin.com/in/pogrebs",
			),
		).toBe(true);
	});

	it("reads twitter.com and x.com as the same account", () => {
		expect(
			sameValue("https://twitter.com/pogrebs", "https://x.com/pogrebs/"),
		).toBe(true);
	});

	it("still separates two different profiles", () => {
		expect(
			sameValue(
				"https://www.linkedin.com/in/pogrebs",
				"https://www.linkedin.com/in/pogrebs-2",
			),
		).toBe(false);
	});

	it("does not merge two hosts that only look alike", () => {
		expect(
			sameValue("https://github.com/pogrebs", "https://gitlab.com/pogrebs"),
		).toBe(false);
	});

	it("collapses the whitespace in a plain value", () => {
		expect(sameValue("  CEO &  Co-founder ", "ceo & co-founder")).toBe(true);
	});

	it("leaves a plain value otherwise alone", () => {
		expect(sameValue("Head of Security", "Head of Marketing")).toBe(false);
	});

	it("drops a query string, because a profile is its path", () => {
		expect(canonicalValue("https://x.com/pogrebs?lang=en")).toBe(
			"x.com/pogrebs",
		);
		expect(
			sameValue(
				"https://www.linkedin.com/in/pogrebs?originalSubdomain=uk",
				"https://www.linkedin.com/in/pogrebs",
			),
		).toBe(true);
	});

	it("compares a value that is not a URL as text", () => {
		expect(canonicalValue("CEO & Co-founder")).toBe("ceo & co-founder");
		expect(canonicalValue("mailto:someone@example.com")).toBe(
			"mailto:someone@example.com",
		);
	});
});
