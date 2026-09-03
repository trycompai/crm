import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { configuredProviders } from "../agent/lib/contact-details";
import { CONTACT_DETAILS } from "../agent/lib/contact-details-config";
import { CONTACT_DETAILS_PROVIDERS } from "../agent/lib/contact-details-providers";
import {
	detailsFrom,
	emailsIn,
	findOnWebsite,
	localPartNamesPerson,
	phonesIn,
	robotsAllows,
	textOf,
	website,
} from "../agent/lib/website";

const realFetch = globalThis.fetch;
const requested: string[] = [];

const ADA = {
	firstName: "Ada",
	lastName: "Lovelace",
	domain: "example.com",
	companyName: "Example",
};

type Reply = { status?: number; type?: string; body: string };

function serves(pages: Record<string, Reply>) {
	globalThis.fetch = (async (input: URL | RequestInfo) => {
		const url = new URL(String(input instanceof Request ? input.url : input));
		requested.push(url.pathname);
		const reply = pages[url.pathname] ?? { status: 404, body: "" };
		return new Response(reply.body, {
			status: reply.status ?? 200,
			headers: { "content-type": reply.type ?? "text/html; charset=utf-8" },
		});
	}) as typeof fetch;
}

beforeEach(() => {
	requested.length = 0;
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

describe("the website provider", () => {
	it("is always on, needs no key, and comes last", () => {
		expect(website.keys).toEqual([]);
		expect(website.enabled()).toBe(true);
		expect(CONTACT_DETAILS.order.at(-1)).toBe("website");
		expect(configuredProviders(CONTACT_DETAILS_PROVIDERS).at(-1)?.id).toBe(
			"website",
		);
	});
});

describe("textOf", () => {
	it("drops scripts and tags and decodes entities", () => {
		const html =
			"<html><script>var x = 'ada@example.com';</script><style>a{}</style><p>Ada&nbsp;Lovelace &amp; co &#64; work</p></html>";
		expect(textOf(html)).toBe("Ada Lovelace & co @ work");
	});
});

describe("emailsIn", () => {
	it("reads mailto links, written addresses and obfuscated ones, on the domain only", () => {
		const html = `
			<a href="mailto:Ada.Lovelace@example.com?subject=hi">write</a>
			<p>Press: press@example.com</p>
			<p>Sales: sales [at] example [dot] com</p>
			<p>Other: someone@elsewhere.org</p>
			<p>Sub: team@mail.example.com</p>
		`;
		expect(emailsIn(html, "example.com")).toEqual([
			"ada.lovelace@example.com",
			"press@example.com",
			"sales@example.com",
			"team@mail.example.com",
		]);
	});
});

describe("phonesIn", () => {
	it("reads tel links and keeps only digits and the plus", () => {
		const html =
			'<a href="tel:+33%201%2023%2045%2067%2089">call</a><a href="tel:+33 1 23 45 67 89">again</a><a href="tel:12">no</a>';
		expect(phonesIn(html)).toEqual(["+33123456789"]);
	});
});

describe("localPartNamesPerson", () => {
	it("accepts the usual name forms and refuses the rest", () => {
		expect(localPartNamesPerson("ada.lovelace", ADA)).toBe(true);
		expect(localPartNamesPerson("alovelace", ADA)).toBe(true);
		expect(localPartNamesPerson("lovelace.a", ADA)).toBe(true);
		expect(localPartNamesPerson("LovelaceAda", ADA)).toBe(true);
		expect(localPartNamesPerson("ada", ADA)).toBe(false);
		expect(localPartNamesPerson("lovelace", ADA)).toBe(false);
		expect(localPartNamesPerson("contact", ADA)).toBe(false);
	});

	it("folds accents", () => {
		const person = { ...ADA, firstName: "Éloïse", lastName: "Müller" };
		expect(localPartNamesPerson("eloise.muller", person)).toBe(true);
	});
});

describe("robotsAllows", () => {
	it("honours the wildcard group only", () => {
		const robots = [
			"User-agent: Googlebot",
			"Disallow: /team",
			"",
			"User-agent: *",
			"Disallow: /private",
			"Disallow: /legal # old",
		].join("\n");
		expect(robotsAllows(robots, "/team")).toBe(true);
		expect(robotsAllows(robots, "/private/x")).toBe(false);
		expect(robotsAllows(robots, "/legal")).toBe(false);
		expect(robotsAllows("", "/anything")).toBe(true);
	});
});

describe("detailsFrom", () => {
	it("returns the named address with the pages it was seen on and the phones there", () => {
		const details = detailsFrom(
			[
				{
					url: "https://example.com/",
					html: '<a href="mailto:info@example.com">info</a><a href="tel:+15550100">x</a>',
				},
				{
					url: "https://example.com/team",
					html: '<h2>Ada Lovelace</h2><a href="mailto:ada.lovelace@example.com">mail</a><a href="tel:+15550199">call</a><a href="https://www.linkedin.com/in/ada">Ada Lovelace</a>',
				},
			],
			ADA,
		);

		expect(details.provider).toBe("website");
		expect(details.email).toBe("ada.lovelace@example.com");
		expect(details.confidence).toBe(CONTACT_DETAILS.website.confidence.named);
		expect(details.sources.map((s) => s.url)).toEqual([
			"https://example.com/team",
		]);
		expect(details.phones).toEqual([{ number: "+15550199", type: "main" }]);
		expect(details.linkedinUrl).toBe("https://www.linkedin.com/in/ada");
	});

	it("accepts a surname-only address when the page names the person", () => {
		const details = detailsFrom(
			[
				{
					url: "https://example.com/contact",
					html: "<p>Ada Lovelace, directrice. lovelace@example.com</p>",
				},
			],
			ADA,
		);
		expect(details.email).toBe("lovelace@example.com");
	});

	it("gives the switchboard only when the site names the person", () => {
		const pages = [
			{
				url: "https://example.com/",
				html: '<a href="tel:+15550100">call</a>',
			},
			{
				url: "https://example.com/team",
				html: "<p>Ada Lovelace</p>",
			},
		];
		const named = detailsFrom(pages, ADA);
		expect(named.email).toBeNull();
		expect(named.phones).toEqual([{ number: "+15550100", type: "main" }]);
		expect(named.confidence).toBe(CONTACT_DETAILS.website.confidence.phoneOnly);
		expect(named.sources.map((s) => s.url)).toEqual([
			"https://example.com/team",
		]);

		const stranger = detailsFrom(pages, { ...ADA, lastName: "Byron" });
		expect(stranger.email).toBeNull();
		expect(stranger.phones).toEqual([]);
		expect(stranger.confidence).toBe(0);
	});
});

describe("findOnWebsite", () => {
	it("reads robots.txt, skips what it forbids, and ignores pages that are not HTML", async () => {
		serves({
			"/robots.txt": {
				type: "text/plain",
				body: "User-agent: *\nDisallow: /team\n",
			},
			"/": { body: "<p>Example</p>" },
			"/contact": {
				body: '<p>Ada Lovelace</p><a href="mailto:a.lovelace@example.com">m</a>',
			},
			"/about": { type: "application/pdf", body: "%PDF" },
		});

		const result = await findOnWebsite(ADA);

		expect(requested).toContain("/robots.txt");
		expect(requested).toContain("/contact");
		expect(requested).not.toContain("/team");
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.email).toBe("a.lovelace@example.com");
		expect(result.data.sources.map((s) => s.url)).toEqual([
			"https://example.com/contact",
		]);
	});

	it("reports a site with no readable page as a reason, not a throw", async () => {
		serves({});
		expect(await findOnWebsite(ADA)).toEqual({
			ok: false,
			reason: "No readable page on example.com.",
		});
	});

	it("refuses without a last name, before any request", async () => {
		serves({ "/": { body: "<p>x</p>" } });
		const result = await findOnWebsite({ ...ADA, lastName: " " });
		expect(result.ok).toBe(false);
		expect(requested).toHaveLength(0);
	});
});
