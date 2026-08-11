import { describe, expect, test } from "bun:test";
import {
	configHash,
	dedupeKey,
	hostAllowed,
	isSiteId,
	loaderUrl,
	mintSiteId,
	normalizeHost,
	originAllowed,
	type TrackingConfig,
	trackingReady,
	trackingSnippet,
} from "../src/tracking";

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
		{ host: "shop.example.com", scope: "EXACT_HOST" },
	],
};

describe("a site id", () => {
	test("is minted in the shape the loader checks for", () => {
		expect(isSiteId(mintSiteId())).toBe(true);
	});

	test("rejects anything else", () => {
		for (const value of ["cmp_", "cmp_ZZZZZZZZ", "8f3ad91c", "", null]) {
			expect(isSiteId(value)).toBe(false);
		}
	});
});

describe("the snippet a rep copies", () => {
	const value = trackingSnippet("http://localhost:3000", "cmp_6e9356c9");

	test("is one line, so no paste target can eat the newlines", () => {
		expect(value).not.toInclude("\n");
	});

	test("keeps a real space between every attribute", () => {
		expect(value).not.toInclude("scriptsrc");
		expect(value).not.toInclude("asyncdefer");
		expect(value).toBe(
			'<script src="http://localhost:3000/t/crm.js" data-site="cmp_6e9356c9" async defer></script>',
		);
	});

	test("survives a paste target that trims every line", () => {
		const trimmed = value
			.split("\n")
			.map((line) => line.trim())
			.join("");

		expect(trimmed).toBe(value);
	});

	test("does not double the slash on a trailing-slash APP_URL", () => {
		expect(loaderUrl("https://crm.example.com/")).toBe(
			"https://crm.example.com/t/crm.js",
		);
	});
});

describe("whether there is anything to install yet", () => {
	test("is not ready with the limit on and no domains", () => {
		expect(trackingReady(true, 0)).toBe(false);
	});

	test("is ready as soon as one domain exists", () => {
		expect(trackingReady(true, 1)).toBe(true);
	});

	test("is ready with the limit off, because every host is allowed", () => {
		expect(trackingReady(false, 0)).toBe(true);
	});
});

describe("a domain", () => {
	test("is reduced to its host", () => {
		expect(normalizeHost("https://Acme.com/pricing?a=1")).toBe("acme.com");
		expect(normalizeHost("  acme.com  ")).toBe("acme.com");
		expect(normalizeHost("acme.com.")).toBe("acme.com");
	});

	test("is refused when it is not one", () => {
		for (const value of ["localhost", "acme", "", " ", "..", "a b.com"]) {
			expect(normalizeHost(value)).toBeNull();
		}
	});
});

describe("the allow-list", () => {
	test("covers subdomains only where the scope says so", () => {
		expect(hostAllowed("trycomp.ai", CONFIG)).toBe(true);
		expect(hostAllowed("docs.trycomp.ai", CONFIG)).toBe(true);
		expect(hostAllowed("shop.example.com", CONFIG)).toBe(true);
		expect(hostAllowed("www.shop.example.com", CONFIG)).toBe(false);
	});

	test("never matches a host that merely ends the same way", () => {
		expect(hostAllowed("nottrycomp.ai", CONFIG)).toBe(false);
		expect(hostAllowed("trycomp.ai.evil.com", CONFIG)).toBe(false);
	});

	test("lets everything through when the limit is off", () => {
		const open = { ...CONFIG, limitToDomains: false };

		expect(hostAllowed("anything.example", open)).toBe(true);
	});
});

describe("the origin check", () => {
	test("accepts an allowed origin and refuses the rest", () => {
		expect(originAllowed("https://docs.trycomp.ai", CONFIG)).toBe(true);
		expect(originAllowed("https://evil.example", CONFIG)).toBe(false);
	});

	test("refuses a missing or unparseable origin", () => {
		expect(originAllowed(null, CONFIG)).toBe(false);
		expect(originAllowed("not-a-url", CONFIG)).toBe(false);
	});

	test("refuses a missing origin even with the limit off", () => {
		const open = { ...CONFIG, limitToDomains: false };

		expect(originAllowed(null, open)).toBe(false);
	});
});

describe("the config hash", () => {
	test("does not move when only the order of the domains does", () => {
		const reordered = { ...CONFIG, hosts: [...CONFIG.hosts].reverse() };

		expect(configHash(reordered)).toBe(configHash(CONFIG));
	});

	test("moves when a setting does", () => {
		expect(configHash({ ...CONFIG, secureCookies: false })).not.toBe(
			configHash(CONFIG),
		);
	});
});

describe("the submission dedupe key", () => {
	test("collapses the same form inside one minute", () => {
		const at = new Date("2026-08-10T12:00:10.000Z");
		const later = new Date("2026-08-10T12:00:50.000Z");
		const parts = { host: "trycomp.ai", path: "/pricing", email: "a@b.com" };

		expect(dedupeKey({ ...parts, at })).toBe(
			dedupeKey({ ...parts, at: later }),
		);
	});

	test("separates a different address on the same page", () => {
		const at = new Date("2026-08-10T12:00:10.000Z");

		expect(
			dedupeKey({ host: "trycomp.ai", path: "/p", email: "a@b.com", at }),
		).not.toBe(
			dedupeKey({ host: "trycomp.ai", path: "/p", email: "c@d.com", at }),
		);
	});
});
