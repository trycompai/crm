import { describe, expect, it } from "bun:test";
import {
	normalizeExternalHttpUrl,
	normalizeSocialUrl,
} from "../src/external-url";

describe("external URL normalization", () => {
	it("normalizes http links that a rep or provider might store", () => {
		expect(normalizeExternalHttpUrl("example.com/pricing")).toBe(
			"https://example.com/pricing",
		);
		expect(normalizeExternalHttpUrl(" https://example.com/jobs?q=eng ")).toBe(
			"https://example.com/jobs?q=eng",
		);
	});

	it("rejects executable, relative, credentialed, and oversized URLs", () => {
		for (const input of [
			"javascript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"/settings",
			"//example.com",
			"https://user:pass@example.com",
			`https://example.com/${"a".repeat(2050)}`,
		]) {
			expect(normalizeExternalHttpUrl(input)).toBeNull();
		}
	});

	it("keeps social fields on their intended hosts", () => {
		expect(normalizeSocialUrl("linkedin.com/company/acme", "linkedin")).toBe(
			"https://linkedin.com/company/acme",
		);
		expect(normalizeSocialUrl("https://x.com/acme", "x")).toBe(
			"https://x.com/acme",
		);
		expect(normalizeSocialUrl("https://github.com/acme", "github")).toBe(
			"https://github.com/acme",
		);
		expect(normalizeSocialUrl("https://evil.test/acme", "github")).toBeNull();
		expect(normalizeSocialUrl("javascript:alert(1)", "linkedin")).toBeNull();
	});
});
