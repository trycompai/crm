import { beforeEach, describe, expect, it } from "bun:test";
import { canonicalWorkspaceEmail, isWorkspaceEmail } from "@crm/auth/workspace";
import { externalParticipants } from "../src/mailbox/participants";

beforeEach(() => {
	process.env.ALLOWED_SIGN_IN = "acme.com";
	process.env.SIGN_IN_EMAIL_ALIASES = "";
});

describe("isWorkspaceEmail", () => {
	it("admits our people", () => {
		for (const email of [
			"lewis@acme.com",
			"LEWIS@Acme.com",
			"  lewis@acme.com  ",
			"someone@mail.acme.com",
		]) {
			expect(isWorkspaceEmail(email)).toBe(true);
		}
	});

	it("refuses everybody else", () => {
		for (const email of [
			"lewis@gmail.com",
			"stranger@example.com",
			"",
			null,
			undefined,
		]) {
			expect(isWorkspaceEmail(email)).toBe(false);
		}
	});

	it("is not fooled by a lookalike domain", () => {
		for (const email of [
			"a@acme.com.evil.com",
			"a@notacme.com",
			"a@acme.community",
			"a@evil.com?@acme.com".replace("?", ""),
		]) {
			expect(isWorkspaceEmail(email)).toBe(false);
		}
	});

	it("fails closed when nothing is allowed", () => {
		process.env.ALLOWED_SIGN_IN = "";
		expect(isWorkspaceEmail("lewis@acme.com")).toBe(false);
	});

	it("does not treat a public suffix as a workspace", () => {
		process.env.ALLOWED_SIGN_IN = "com,co.uk";

		expect(isWorkspaceEmail("attacker@acme.com")).toBe(false);
		expect(isWorkspaceEmail("attacker@company.co.uk")).toBe(false);
	});

	it("admits a single address, for a one-person install", () => {
		process.env.ALLOWED_SIGN_IN = "lewis@gmail.com";

		expect(isWorkspaceEmail("lewis@gmail.com")).toBe(true);
		expect(isWorkspaceEmail("someone.else@gmail.com")).toBe(false);
	});

	it("mixes a domain with individual outsiders", () => {
		process.env.ALLOWED_SIGN_IN = "acme.com, contractor@gmail.com";

		expect(isWorkspaceEmail("lewis@acme.com")).toBe(true);
		expect(isWorkspaceEmail("contractor@gmail.com")).toBe(true);
		expect(isWorkspaceEmail("stranger@gmail.com")).toBe(false);
	});

	it("canonicalises an allowed alias without admitting the rest of its domain", () => {
		process.env.ALLOWED_SIGN_IN = "admin@acme.com,angus@acme.com";
		process.env.SIGN_IN_EMAIL_ALIASES = "richard@acme.com=admin@acme.com";

		expect(canonicalWorkspaceEmail(" RICHARD@acme.com ")).toBe(
			"admin@acme.com",
		);
		expect(isWorkspaceEmail("richard@acme.com")).toBe(true);
		expect(isWorkspaceEmail("someone-else@acme.com")).toBe(false);
	});

	it("ignores malformed aliases", () => {
		process.env.ALLOWED_SIGN_IN = "admin@acme.com";
		process.env.SIGN_IN_EMAIL_ALIASES =
			"missing-pair,not-an-email=admin@acme.com,a@acme.com=b@acme.com=c@acme.com";

		expect(isWorkspaceEmail("not-an-email")).toBe(false);
		expect(isWorkspaceEmail("a@acme.com")).toBe(false);
	});
});

describe("internal addresses never become leads", () => {
	const options = {
		ourDomains: new Set(["acme.com"]),
		ourAddresses: new Set<string>(),
		suppressedDomains: new Set<string>(),
		suppressedEmails: new Set<string>(),
	};

	it("drops colleagues even when they are not users", () => {
		const result = externalParticipants(
			[
				{ email: "lewis@acme.com", name: "Lewis" },
				{ email: "newstarter@acme.com", name: "New Starter" },
				{ email: "jane@globex.com", name: "Jane" },
			],
			options,
		);

		expect(result.map((person) => person.email)).toEqual(["jane@globex.com"]);
	});

	it("stores nothing for a wholly internal thread", () => {
		expect(
			externalParticipants(
				[
					{ email: "lewis@acme.com", name: null },
					{ email: "colleague@acme.com", name: null },
				],
				options,
			),
		).toEqual([]);
	});
});
