import { describe, expect, test } from "bun:test";
import {
	configHash,
	dedupeKey,
	gtmContainers,
	gtmContainerUrl,
	gtmSnippet,
	gtmTag,
	hostAllowed,
	isSiteId,
	loaderUrl,
	matchedHost,
	mintSiteId,
	normalizeHost,
	normalizePath,
	originAllowed,
	stripQuery,
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

describe("the snippet a rep pastes into Tag Manager", () => {
	const value = gtmSnippet("https://crm.example.com", "cmp_6e9356c9");

	test("carries the site id in the URL, where the injector cannot drop it", () => {
		expect(value).toBe(
			'<script src="https://crm.example.com/t/crm.js?site=cmp_6e9356c9" async defer></script>',
		);
	});

	test("carries no data-site, so there is nothing to lose", () => {
		expect(value).not.toInclude("data-site");
	});
});

describe("finding the tag inside a Tag Manager container", () => {
	const custom = (attributes: string) =>
		`{"function":"__html","vtp_html":"\\u003Cscript ${attributes} type=\\"text\\/gtmscript\\"\\u003E\\u003C\\/script\\u003E"}`;

	test("reads the container ids out of a page", () => {
		const html =
			'<script src="https://www.googletagmanager.com/gtm.js?id=GTM-N47SXGJB"></script>' +
			"<script>(function(w,l){})(window,'dataLayer');'GTM-N47SXGJB'</script>";

		expect(gtmContainers(html)).toEqual(["GTM-N47SXGJB"]);
	});

	test("takes at most two containers, because each one is half a megabyte", () => {
		const html = ["GTM-AAAA1111", "GTM-BBBB2222", "GTM-CCCC3333"].join(" ");

		expect(gtmContainers(html)).toEqual(["GTM-AAAA1111", "GTM-BBBB2222"]);
	});

	test("finds nothing in a page that has no container", () => {
		expect(gtmContainers("<html><body>nothing here</body></html>")).toEqual([]);
	});

	test("builds the container URL from the id alone, so nothing user-typed is fetched", () => {
		expect(gtmContainerUrl("GTM-N47SXGJB")).toBe(
			"https://www.googletagmanager.com/gtm.js?id=GTM-N47SXGJB",
		);
	});

	test("reports the URL form as the one that survives injection", () => {
		const source = custom(
			'data-gtmsrc=\\"https:\\/\\/crm.example.com\\/t\\/crm.js?site=cmp_8f3ad91c\\" async defer',
		);

		expect(gtmTag(source, "cmp_8f3ad91c")).toBe("url");
	});

	test("reports the attribute form, which Tag Manager strips on the way in", () => {
		const source = custom(
			'data-gtmsrc=\\"https:\\/\\/crm.example.com\\/t\\/crm.js\\" data-site=\\"cmp_8f3ad91c\\" async defer',
		);

		expect(gtmTag(source, "cmp_8f3ad91c")).toBe("attribute");
	});

	test("is absent when the container carries a tag for a site id we rotated away from", () => {
		const source = custom(
			'data-gtmsrc=\\"https:\\/\\/crm.example.com\\/t\\/crm.js\\" data-site=\\"cmp_11112222\\"',
		);

		expect(gtmTag(source, "cmp_8f3ad91c")).toBe("absent");
	});

	test("is absent from a container full of somebody else's tags", () => {
		const source = custom(
			'data-gtmsrc=\\"https:\\/\\/js-na2.hs-scripts.com\\/243178497.js\\"',
		);

		expect(gtmTag(source, "cmp_8f3ad91c")).toBe("absent");
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

describe("a page path", () => {
	test("drops the query and the fragment so one page is one row", () => {
		expect(normalizePath("/?utm_source=google&utm_medium=cpc")).toBe("/");
		expect(normalizePath("/pricing?plan=team")).toBe("/pricing");
		expect(normalizePath("/docs/api#install")).toBe("/docs/api");
	});

	test("drops a trailing slash so /pricing and /pricing/ are one page", () => {
		expect(normalizePath("/pricing/")).toBe("/pricing");
		expect(normalizePath("/")).toBe("/");
	});

	test("falls back to the root when it is not a path", () => {
		for (const value of ["", "  ", null, undefined, "pricing", "//"]) {
			expect(normalizePath(value)).toBe("/");
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

describe("the domain an event belongs to", () => {
	test("is the parent when the scope covers subdomains", () => {
		expect(matchedHost("docs.trycomp.ai", CONFIG)?.host).toBe("trycomp.ai");
		expect(matchedHost("trycomp.ai", CONFIG)?.host).toBe("trycomp.ai");
	});

	test("is the exact row when that is the whole of the scope", () => {
		expect(matchedHost("shop.example.com", CONFIG)?.host).toBe(
			"shop.example.com",
		);
		expect(matchedHost("www.shop.example.com", CONFIG)).toBeNull();
	});

	test("is nothing for a host nobody configured", () => {
		expect(matchedHost("elsewhere.example", CONFIG)).toBeNull();
	});

	test("prefers the host's own row to the parent that also covers it", () => {
		const both: TrackingConfig = {
			...CONFIG,
			hosts: [
				{ host: "trycomp.ai", scope: "SITE_AND_SUBDOMAINS" },
				{ host: "docs.trycomp.ai", scope: "EXACT_HOST" },
			],
		};

		expect(matchedHost("docs.trycomp.ai", both)?.host).toBe("docs.trycomp.ai");
		expect(matchedHost("blog.trycomp.ai", both)?.host).toBe("trycomp.ai");
	});
});

describe("a stored referrer", () => {
	test("keeps the page but never the query a secret could sit in", () => {
		expect(stripQuery("https://acme.com/reset?token=abc#x")).toBe(
			"https://acme.com/reset",
		);
		expect(stripQuery("https://acme.com/blog")).toBe("https://acme.com/blog");
	});

	test("is nothing when there was nothing but a query", () => {
		for (const value of ["", "  ", null, undefined, "?token=abc"]) {
			expect(stripQuery(value)).toBeNull();
		}
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
