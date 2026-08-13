import { describe, expect, test } from "bun:test";
import { renderEmail } from "../src/render";

const BASE = {
	workspaceName: "Comp AI",
	postalAddress: "2261 Market Street, San Francisco",
	unsubscribeUrl: "https://example.com/u/abc",
};

const BODY = {
	version: 1,
	blocks: [{ type: "text", text: [{ text: "Hello" }] }],
};

describe("the brand line at the top", () => {
	test("draws the logo once, and no wordmark beside it", async () => {
		const { html } = await renderEmail({
			document: BODY,
			shell: {
				...BASE,
				logoUrl: "https://cdn.example.com/logo.jpg",
				logoAlt: "Comp AI",
				header: { version: 1, blocks: [] },
			},
		});

		expect(html).toContain("https://cdn.example.com/logo.jpg");
		expect(html.split("Comp AI").length - 1).toBe(1);
	});

	test("falls back to the wordmark when there is no logo", async () => {
		const { html } = await renderEmail({
			document: BODY,
			shell: { ...BASE, header: { version: 1, blocks: [] } },
		});

		expect(html).toContain("Comp AI");
		expect(html).not.toContain("<img");
	});

	test("the default shell adds no rule of its own", async () => {
		const { html } = await renderEmail({
			document: BODY,
			shell: {
				...BASE,
				logoUrl: "https://cdn.example.com/logo.jpg",
				header: { version: 1, blocks: [] },
				footer: {
					version: 1,
					blocks: [{ type: "text", text: [{ text: "Why you got this" }] }],
				},
			},
		});

		expect(html).not.toContain("<hr");
	});

	test("uses the brand colour on a button", async () => {
		const { html } = await renderEmail({
			document: {
				version: 1,
				blocks: [
					{ type: "button", label: "Read more", href: "https://example.com" },
				],
			},
			shell: { ...BASE, brandColor: "#054d3c" },
		});

		expect(html.toLowerCase()).toContain("#054d3c");
	});
});
