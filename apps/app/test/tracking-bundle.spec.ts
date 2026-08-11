import { describe, expect, test } from "bun:test";
import { brotliCompressSync } from "node:zlib";
import type { TrackingConfig } from "@crm/db/tracking";
import { LOADER_SOURCE } from "@/lib/tracking/loader";
import { trackerSource } from "@/lib/tracking/tracker";

const LOADER_BUDGET = 1024;

const TRACKER_BUDGET = 4096;

const CONFIG: TrackingConfig = {
	siteId: "cmp_8f3ad91c",
	crossDomain: true,
	limitToDomains: true,
	cookieSubdomains: false,
	secureCookies: true,
	honourDnt: true,
	cookieDays: 395,
	hosts: [
		{ host: "trycomp.ai", scope: "SITE_AND_SUBDOMAINS" },
		{ host: "www.trycomp.ai", scope: "EXACT_HOST" },
		{ host: "docs.trycomp.ai", scope: "EXACT_HOST" },
		{ host: "app.trycomp.ai", scope: "EXACT_HOST" },
	],
};

function brotli(source: string): number {
	return brotliCompressSync(Buffer.from(source, "utf8")).length;
}

describe("the tracking bundle stays inside its budget", () => {
	test("the loader is under a kilobyte", () => {
		expect(brotli(LOADER_SOURCE)).toBeLessThanOrEqual(LOADER_BUDGET);
	});

	test("the tracker is under the four kilobytes the settings page promises", () => {
		const source = trackerSource(CONFIG, "https://crm.example.com/api/t/e");

		expect(brotli(source)).toBeLessThanOrEqual(TRACKER_BUDGET);
	});

	test("the loader only ever injects a site it was given", () => {
		expect(LOADER_SOURCE).toContain("cmp_[0-9a-f]{8}");
		expect(LOADER_SOURCE).toContain("document.currentScript");
	});
});

function inject(
	tag: { src: string; "data-site"?: string },
	existing: boolean = false,
): string[] {
	const injected: string[] = [];

	const script = {
		src: tag.src,
		getAttribute: (name: string) =>
			name === "data-site" ? (tag["data-site"] ?? null) : null,
	};

	const document = {
		currentScript: script,
		querySelector: () => script,
		getElementById: () => (existing ? script : null),
		createElement: () => ({}) as Record<string, unknown>,
		head: {
			appendChild: (node: { src: string }) => injected.push(node.src),
		},
	};

	new Function("document", LOADER_SOURCE)(document);

	return injected;
}

describe("the loader finds the site id however the page was built", () => {
	test("reads the attribute a rep pasted into their own HTML", () => {
		expect(
			inject({
				src: "https://crm.example.com/t/crm.js",
				"data-site": "cmp_8f3ad91c",
			}),
		).toEqual(["https://crm.example.com/t/cmp_8f3ad91c.js"]);
	});

	test("reads the URL when a tag manager stripped the attribute", () => {
		expect(
			inject({ src: "https://crm.example.com/t/crm.js?site=cmp_8f3ad91c" }),
		).toEqual(["https://crm.example.com/t/cmp_8f3ad91c.js"]);
	});

	test("prefers the attribute, so a stale URL cannot outvote the pasted tag", () => {
		expect(
			inject({
				src: "https://crm.example.com/t/crm.js?site=cmp_11112222",
				"data-site": "cmp_8f3ad91c",
			}),
		).toEqual(["https://crm.example.com/t/cmp_8f3ad91c.js"]);
	});

	test("injects nothing when neither carries a site", () => {
		expect(inject({ src: "https://crm.example.com/t/crm.js" })).toEqual([]);
	});

	test("refuses a site id from the URL that is not one", () => {
		for (const site of ["../config", "cmp_ZZZZZZZZ", "cmp_", ""]) {
			expect(
				inject({
					src: `https://crm.example.com/t/crm.js?site=${encodeURIComponent(site)}`,
				}),
			).toEqual([]);
		}
	});

	test("injects once, however many copies of the tag a container fires", () => {
		expect(
			inject(
				{ src: "https://crm.example.com/t/crm.js?site=cmp_8f3ad91c" },
				true,
			),
		).toEqual([]);
	});

	test("the tracker bakes the config in rather than fetching it", () => {
		const source = trackerSource(CONFIG, "https://crm.example.com/api/t/e");

		expect(source).toContain("cmp_8f3ad91c");
		expect(source).toContain("docs.trycomp.ai");
		expect(source).not.toContain("/api/t/config");
	});
});
