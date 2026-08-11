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

	test("the tracker bakes the config in rather than fetching it", () => {
		const source = trackerSource(CONFIG, "https://crm.example.com/api/t/e");

		expect(source).toContain("cmp_8f3ad91c");
		expect(source).toContain("docs.trycomp.ai");
		expect(source).not.toContain("/api/t/config");
	});
});
