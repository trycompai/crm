import { describe, expect, it } from "bun:test";
import {
	domainFromEmail,
	isMachineDomain,
	normalizeDomain,
} from "../src/companies/domain";

describe("normalizeDomain", () => {
	it("reduces anything a human might type to the bare host", () => {
		for (const input of [
			"stripe.com",
			"STRIPE.com",
			"  stripe.com  ",
			"www.stripe.com",
			"https://stripe.com",
			"https://www.Stripe.com/pricing?ref=x",
			"http://stripe.com/",
		]) {
			expect(normalizeDomain(input)).toBe("stripe.com");
		}
	});

	it("rejects things that are not hostnames", () => {
		for (const input of [
			"",
			"   ",
			"localhost",
			"my company",
			"not a domain",
		]) {
			expect(normalizeDomain(input)).toBeNull();
		}
		expect(normalizeDomain(null)).toBeNull();
		expect(normalizeDomain(undefined)).toBeNull();
	});
});

describe("domainFromEmail", () => {
	it("takes the domain off a work address", () => {
		expect(domainFromEmail("ada@stripe.com")).toBe("stripe.com");
		expect(domainFromEmail("  Ada@WWW.Stripe.com ")).toBe("stripe.com");
	});

	it("ignores free and malformed addresses", () => {
		for (const email of [
			"ada@gmail.com",
			"ada@outlook.com",
			"ada@proton.me",
			"@stripe.com",
			"not-an-email",
			"",
		]) {
			expect(domainFromEmail(email)).toBeNull();
		}
	});

	it("never derives a company from infrastructure", () => {
		for (const email of [
			"c_f5ecd6a22aea945a2d5c6ac9b8b2b16b@group.calendar.google.com",
			"list@googlegroups.com",
			"reply@em1234.amazonses.com",
		]) {
			expect(domainFromEmail(email)).toBeNull();
		}
	});
});

describe("isMachineDomain", () => {
	it("is false for a real host and for nothing", () => {
		expect(isMachineDomain("stripe.com")).toBe(false);
		expect(isMachineDomain("calendar.acme.com")).toBe(false);
		expect(isMachineDomain(null)).toBe(false);
		expect(isMachineDomain("")).toBe(false);
	});
});
