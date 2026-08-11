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
