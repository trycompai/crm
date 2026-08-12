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

	test("the tracker fails closed for privacy and QA signals", () => {
		const source = trackerSource(CONFIG, "https://crm.example.com/api/t/e");

		expect(source).toContain('data-crm-tracking")==="off"');
		expect(source).toContain('data-crm-consent")!=="granted"');
		expect(source).toContain("navigator.globalPrivacyControl");
		expect(source).toContain("navigator.webdriver");
		expect(source).toContain("marketing|newsletter|privacy|terms");
	});
});

type Listener = {
	target: "document" | "window";
	type: string;
	handler: (event: { target?: unknown }) => void;
	capture: boolean | undefined;
};

function trackerRuntime(consent: string | null) {
	const cookies = new Map<string, string>();
	const listeners: Listener[] = [];
	const sent: string[] = [];
	const originalPush = () => undefined;
	const originalReplace = () => undefined;
	const document = {
		documentElement: {
			getAttribute: (name: string) =>
				name === "data-crm-consent" ? consent : null,
		},
		visibilityState: "visible",
		referrer: "",
		body: {},
		get cookie() {
			return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
		},
		set cookie(value: string) {
			const [pair, ...attributes] = value.split(";");
			const [name, stored = ""] = pair?.trim().split("=") ?? [];
			if (!name) return;
			if (attributes.some((attribute) => /max-age=0/i.test(attribute))) {
				cookies.delete(name);
				return;
			}
			cookies.set(name, stored);
		},
		addEventListener: (
			type: string,
			handler: Listener["handler"],
			capture?: boolean,
		) => listeners.push({ target: "document", type, handler, capture }),
		removeEventListener: (
			type: string,
			handler: Listener["handler"],
			capture?: boolean,
		) => {
			const index = listeners.findIndex(
				(listener) =>
					listener.target === "document" &&
					listener.type === type &&
					listener.handler === handler &&
					listener.capture === capture,
			);
			if (index >= 0) listeners.splice(index, 1);
		},
	};
	const window = {
		location: {
			hostname: "trycomp.ai",
			protocol: "https:",
			search: "",
			hash: "",
			href: "https://trycomp.ai/",
			origin: "https://trycomp.ai",
			pathname: "/",
		},
		history: { pushState: originalPush, replaceState: originalReplace },
		crypto: { randomUUID: () => "12345678-1234-1234-1234-123456789012" },
		addEventListener: (
			type: string,
			handler: Listener["handler"],
			capture?: boolean,
		) => listeners.push({ target: "window", type, handler, capture }),
		removeEventListener: (
			type: string,
			handler: Listener["handler"],
			capture?: boolean,
		) => {
			const index = listeners.findIndex(
				(listener) =>
					listener.target === "window" &&
					listener.type === type &&
					listener.handler === handler &&
					listener.capture === capture,
			);
			if (index >= 0) listeners.splice(index, 1);
		},
		requestIdleCallback: (callback: () => void) => {
			callback();
			return 1;
		},
		cancelIdleCallback: () => undefined,
	};
	const navigator = {
		sendBeacon: (_endpoint: string, body: Blob) => {
			sent.push(String(body.size));
			return true;
		},
	};

	return {
		cookies,
		document,
		listeners,
		navigator,
		originalPush,
		originalReplace,
		sent,
		window,
	};
}

function runTracker(runtime: ReturnType<typeof trackerRuntime>) {
	new Function(
		"document",
		"window",
		"navigator",
		"Blob",
		trackerSource(CONFIG, "https://crm.example.com/api/t/e"),
	)(runtime.document, runtime.window, runtime.navigator, Blob);
}

describe("the tracker lifecycle", () => {
	test("requires root consent before it exposes a lifecycle", () => {
		const runtime = trackerRuntime(null);

		runTracker(runtime);

		expect(runtime.window).not.toHaveProperty("LodeCRMTracker");
		expect(runtime.cookies.size).toBe(0);
		expect(runtime.listeners).toHaveLength(0);
	});

	test("destroys all runtime state and permits a clean restart", () => {
		const runtime = trackerRuntime("granted");

		runTracker(runtime);
		const tracker = (
			runtime.window as {
				LodeCRMTracker?: { active: boolean; destroy: () => void };
			}
		).LodeCRMTracker;

		expect(tracker?.active).toBe(true);
		expect(runtime.cookies.size).toBeGreaterThan(0);
		expect(runtime.listeners.length).toBeGreaterThan(0);
		expect(runtime.window.history.pushState).not.toBe(runtime.originalPush);

		tracker?.destroy();

		expect(tracker?.active).toBe(false);
		expect(runtime.cookies.size).toBe(0);
		expect(runtime.listeners).toHaveLength(0);
		expect(runtime.window.history.pushState).toBe(runtime.originalPush);
		expect(runtime.window.history.replaceState).toBe(runtime.originalReplace);
		expect(runtime.sent).toEqual([]);

		runTracker(runtime);

		expect(
			(runtime.window as { LodeCRMTracker?: { active: boolean } })
				.LodeCRMTracker?.active,
		).toBe(true);
	});
});
