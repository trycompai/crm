import { describe, expect, test } from "bun:test";
import { renderEmail } from "../src/render";
import { EMAIL_CONTENT_WIDTH, EMAIL_WIDTH } from "../src/theme";

const LONG_URL =
	"https://app.example.com/settings/connections/resend/callback?state=3f9c2a7b1d4e8f6a0c5b9d2e7f1a4c8b3d6e9f2a5c8b1d4e7f0a3c6b9d2e5f8a";

const shell = {
	workspaceName: "Comp AI",
	postalAddress: "Comp AI · 2261 Market Street, San Francisco",
	unsubscribeUrl: "https://app.example.com/u/token",
};

const ADVERSARIAL = {
	"a long unbroken url in a text run": {
		document: {
			version: 1,
			blocks: [{ type: "text", text: [{ text: LONG_URL }] }],
		},
		shell,
	},
	"a long unbroken word in a heading": {
		document: {
			version: 1,
			blocks: [
				{
					type: "heading",
					level: 1,
					text: [{ text: "Supercalifragilistic".repeat(8) }],
				},
			],
		},
		shell,
	},
	"a long unbroken url in a quote": {
		document: {
			version: 1,
			blocks: [{ type: "quote", text: [{ text: LONG_URL }] }],
		},
		shell,
	},
	"a button with a long unbroken label": {
		document: {
			version: 1,
			blocks: [
				{
					type: "button",
					label: "DownloadTheCompleteQuarterlyRevenuePlaybook2026Edition",
					href: "https://example.com/playbook",
				},
			],
		},
		shell,
	},
	"an image asking for 1200 pixels": {
		document: {
			version: 1,
			blocks: [
				{
					type: "image",
					src: "https://cdn.example.com/banner.png",
					alt: "Banner",
					width: 1200,
				},
			],
		},
		shell,
	},
	"columns holding a long url and an image": {
		document: {
			version: 1,
			blocks: [
				{
					type: "columns",
					columns: [
						[{ type: "text", text: [{ text: LONG_URL }] }],
						[
							{
								type: "image",
								src: "https://cdn.example.com/chart.png",
								alt: "Chart",
								width: 400,
							},
						],
					],
				},
			],
		},
		shell,
	},
	"a wide logo in the header": {
		document: {
			version: 1,
			blocks: [{ type: "text", text: [{ text: "Hello." }] }],
		},
		shell: {
			...shell,
			logoUrl: "https://cdn.example.com/wordmark-1600x64.png",
			logoAlt: "Comp AI",
		},
	},
	"a preheader and a footer": {
		document: {
			version: 1,
			blocks: [{ type: "text", text: [{ text: "Hello." }] }],
		},
		preheader: "A preheader long enough to trigger the whitespace padding",
		shell,
	},
} as const;

const MSO_CONDITIONAL = /<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g;
const PIXEL_STYLE_WIDTH = /(?<!-)width:(\d+(?:\.\d+)?)px/g;
const ATTRIBUTE_WIDTH = /width="(\d+)"/g;

function rendered(name: keyof typeof ADVERSARIAL) {
	return renderEmail(ADVERSARIAL[name]);
}

describe("every email lays out inside the device width", () => {
	for (const name of Object.keys(ADVERSARIAL) as (keyof typeof ADVERSARIAL)[]) {
		test(`${name}: every img carries max-width:100%`, async () => {
			const { html } = await rendered(name);
			const images = html.match(/<img[^>]*>/g) ?? [];
			for (const tag of images) {
				expect(tag).toContain("max-width:100%");
			}
		});

		test(`${name}: no attribute width past ${EMAIL_WIDTH} outside the mso shell`, async () => {
			const { html } = await rendered(name);
			const visible = html.replace(MSO_CONDITIONAL, "");
			for (const match of visible.matchAll(ATTRIBUTE_WIDTH)) {
				expect(Number(match[1])).toBeLessThanOrEqual(EMAIL_WIDTH);
			}
		});

		test(`${name}: no pixel style width past ${EMAIL_WIDTH}, and none fixes the shell`, async () => {
			const { html } = await rendered(name);
			const visible = html.replace(MSO_CONDITIONAL, "");
			for (const match of visible.matchAll(PIXEL_STYLE_WIDTH)) {
				expect(Number(match[1])).toBeLessThan(EMAIL_WIDTH);
			}
		});

		test(`${name}: the container is fluid with a ${EMAIL_WIDTH}px cap`, async () => {
			const { html } = await rendered(name);
			const container = html
				.replace(MSO_CONDITIONAL, "")
				.match(new RegExp(`<table[^>]*width="${EMAIL_WIDTH}"[^>]*>`))?.[0];
			expect(container).toBeDefined();
			expect(container).toContain("width:100%");
			expect(container).toContain(`max-width:${EMAIL_WIDTH}px`);
		});

		test(`${name}: outlook gets one fixed shell through the mso conditional`, async () => {
			const { html } = await rendered(name);
			const opens = html.match(
				new RegExp(`<!--\\[if mso\\]><table[^>]*width="${EMAIL_WIDTH}"`, "g"),
			);
			const closes = html.match(/<!--\[if mso\]><\/td><\/tr><\/table>/g);
			expect(opens).toHaveLength(1);
			expect(closes).toHaveLength(1);
			expect(html).not.toContain("mso-shell");
		});
	}

	test("text, heading, quote and button all break long words", async () => {
		for (const name of [
			"a long unbroken url in a text run",
			"a long unbroken word in a heading",
			"a long unbroken url in a quote",
		] as const) {
			const { html } = await rendered(name);
			const paragraphs = html.match(/<p[^>]*>/g) ?? [];
			expect(
				paragraphs.some((tag) => tag.includes("word-break:break-word")),
			).toBe(true);
		}

		const { html } = await rendered("a button with a long unbroken label");
		const anchor = html.match(
			/<a href="https:\/\/example\.com\/playbook"[^>]*>/,
		)?.[0];
		expect(anchor).toBeDefined();
		expect(anchor).toContain("word-break:break-word");
		expect(anchor).toContain("max-width:100%");
	});

	test("an oversized image request renders at the content width", async () => {
		const { html } = await rendered("an image asking for 1200 pixels");
		expect(html).toContain(`width="${EMAIL_CONTENT_WIDTH}"`);
		expect(html).not.toContain('width="1200"');
	});

	test("the header logo cannot outgrow the shell", async () => {
		const { html } = await rendered("a wide logo in the header");
		const logo = html.match(/<img[^>]*wordmark-1600x64[^>]*>/)?.[0];
		expect(logo).toBeDefined();
		expect(logo).toContain("max-width:100%");
	});
});
