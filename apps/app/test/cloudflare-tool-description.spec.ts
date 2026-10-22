import { describe, expect, test } from "bun:test";
import { presentCloudflareToolDescription } from "../app/(app)/[slug]/settings/connections/cloudflare-tool-description";

describe("Cloudflare tool descriptions", () => {
	test("formats the available TypeScript API", async () => {
		const description = [
			"Execute JavaScript code that can manage Cloudflare resources.",
			"",
			"Available in your code:",
			"",
			"interface CloudflareRequestOptions {",
			"  method: string;",
			"}",
			"",
			"declare const accountId: string;",
		].join("\n");

		expect(await presentCloudflareToolDescription(description)).toMatchObject({
			prose: "Execute JavaScript code that can manage Cloudflare resources.",
			code: {
				highlightedHTML: expect.stringContaining("shiki"),
				label: "TypeScript API",
				value: [
					"interface CloudflareRequestOptions {",
					"  method: string;",
					"}",
					"",
					"declare const accountId: string;",
				].join("\n"),
			},
		});
	});

	test("keeps ordinary descriptions as prose", async () => {
		expect(
			await presentCloudflareToolDescription("Reports the current identity."),
		).toEqual({ prose: "Reports the current identity." });
	});
});
