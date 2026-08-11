import { describe, expect, test } from "bun:test";
import { classifyTouch, describeTouch } from "../src/attribution";

const AT = new Date("2026-08-10T12:00:00.000Z");

describe("a touch with utm parameters", () => {
	test("takes the campaign the marketer named, verbatim", () => {
		const touch = classifyTouch(
			{
				source: "newsletter",
				medium: "email",
				campaign: "august-launch",
				term: "crm",
				content: "banner",
				landing: "/pricing",
			},
			AT,
		);

		expect(touch.source).toBe("newsletter");
		expect(touch.medium).toBe("email");
		expect(touch.campaign).toBe("august-launch");
		expect(touch.term).toBe("crm");
		expect(touch.content).toBe("banner");
		expect(touch.landing).toBe("/pricing");
	});

	test("beats the referrer, because the marketer was explicit", () => {
		const touch = classifyTouch(
			{ source: "partner-blog", referrer: "https://www.google.com/" },
			AT,
		);

		expect(touch.source).toBe("partner-blog");
	});

	test("folds the paid aliases onto one medium", () => {
		for (const medium of ["cpc", "ppc", "paid", "paidsearch", "paid_search"]) {
			expect(classifyTouch({ source: "google", medium }, AT).medium).toBe(
				"cpc",
			);
		}
	});

	test("keeps an unknown medium out of the vocabulary", () => {
		expect(
			classifyTouch({ source: "x", medium: "carrier-pigeon" }, AT).medium,
		).toBe("other");
	});
});

describe("a touch with only a referrer", () => {
	test("names the search engine and calls it organic", () => {
		const touch = classifyTouch(
			{ referrer: "https://www.google.co.uk/search?q=crm" },
			AT,
		);

		expect(touch.source).toBe("Google");
		expect(touch.medium).toBe("organic");
	});

	test("names the social network and calls it social", () => {
		expect(classifyTouch({ referrer: "https://t.co/abc" }, AT).source).toBe(
			"X",
		);
		expect(classifyTouch({ referrer: "https://lnkd.in/abc" }, AT).medium).toBe(
			"social",
		);
	});

	test("calls a webmail host email, not the search engine it shares a name with", () => {
		const gmail = classifyTouch({ referrer: "https://mail.google.com/" }, AT);

		expect(gmail.source).toBe("Gmail");
		expect(gmail.medium).toBe("email");

		const yahoo = classifyTouch({ referrer: "https://mail.yahoo.com/" }, AT);

		expect(yahoo.source).toBe("Yahoo Mail");
		expect(yahoo.medium).toBe("email");
	});

	test("never trusts a host that merely contains a provider's name", () => {
		for (const referrer of [
			"https://notgoogle.com/",
			"https://evilfacebook.com/",
			"https://google.com.phish.example/",
		]) {
			expect(classifyTouch({ referrer }, AT).medium).toBe("referral");
		}
	});

	test("never trusts a provider's name used as somebody else's subdomain", () => {
		for (const referrer of [
			"https://google.evil.com/",
			"https://mail.google.evil.com/",
			"https://facebook.attacker.net/",
			"https://outlook.phish.example/",
			"https://google.com.example/",
			"https://google.co.example/",
		]) {
			expect(classifyTouch({ referrer }, AT).medium).toBe("referral");
		}
	});

	test("still recognises a provider on a subdomain or a country domain", () => {
		for (const [referrer, source] of [
			["https://images.google.de/", "Google"],
			["https://scholar.google.co.jp/", "Google"],
			["https://m.facebook.com/", "Facebook"],
			["https://uk.search.yahoo.com/", "Yahoo"],
			["https://news.ycombinator.com/", "Hacker News"],
			["https://gist.github.com/", "GitHub"],
			["https://t.co/abc", "X"],
			["https://youtu.be/abc", "YouTube"],
		] as const) {
			expect(classifyTouch({ referrer }, AT).source).toBe(source);
		}
	});

	test("falls back to the bare host for anything else", () => {
		const touch = classifyTouch({ referrer: "https://www.acme.com/blog" }, AT);

		expect(touch.source).toBe("acme.com");
		expect(touch.medium).toBe("referral");
	});

	test("is direct when there is no referrer at all", () => {
		const touch = classifyTouch({ landing: "/" }, AT);

		expect(touch.source).toBe("Direct");
		expect(touch.medium).toBe("direct");
		expect(touch.referrer).toBeNull();
	});

	test("is direct when the referrer is not a URL", () => {
		expect(classifyTouch({ referrer: "android-app" }, AT).medium).toBe(
			"direct",
		);
	});
});

describe("reading a touch back", () => {
	test("reads as source, medium and campaign", () => {
		expect(
			describeTouch({
				source: "Google",
				medium: "organic",
				campaign: null,
			}),
		).toBe("Google · organic");

		expect(
			describeTouch({
				source: "newsletter",
				medium: "email",
				campaign: "august-launch",
			}),
		).toBe("newsletter · email · august-launch");
	});

	test("does not repeat itself for direct traffic", () => {
		expect(
			describeTouch({ source: "Direct", medium: "direct", campaign: null }),
		).toBe("Direct");
	});

	test("says so when there is nothing to say", () => {
		expect(describeTouch({ source: null, medium: null, campaign: null })).toBe(
			"Unknown",
		);
	});
});
