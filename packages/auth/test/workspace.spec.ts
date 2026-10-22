import { afterEach, describe, expect, it } from "bun:test";
import { isWorkspaceEmail, primaryWorkspaceDomain } from "../src/workspace";

const original = process.env.ALLOWED_SIGN_IN;

afterEach(() => {
	if (original === undefined) delete process.env.ALLOWED_SIGN_IN;
	else process.env.ALLOWED_SIGN_IN = original;
});

describe("the domain behind the account chooser", () => {
	it("is the configured domain when one is configured", () => {
		process.env.ALLOWED_SIGN_IN = "acme.com";
		expect(primaryWorkspaceDomain()).toBe("acme.com");
	});

	it("is derived from a single address, so a solo self-hoster gets the hint too", () => {
		process.env.ALLOWED_SIGN_IN = "rep@acme.com";
		expect(primaryWorkspaceDomain()).toBe("acme.com");
	});

	it("is withheld when the addresses span more than one domain", () => {
		// `hd` narrows the chooser to one domain, so sending it for one of two
		// would hide the other rather than help.
		process.env.ALLOWED_SIGN_IN = "rep@acme.com,other@beta.com";
		expect(primaryWorkspaceDomain()).toBeUndefined();
	});

	it("still prefers a configured domain over an address", () => {
		process.env.ALLOWED_SIGN_IN = "rep@beta.com,acme.com";
		expect(primaryWorkspaceDomain()).toBe("acme.com");
	});

	it("is nothing when the list is empty, which fails closed", () => {
		process.env.ALLOWED_SIGN_IN = "";
		expect(primaryWorkspaceDomain()).toBeUndefined();
	});

	it("does not widen who may sign in", () => {
		process.env.ALLOWED_SIGN_IN = "rep@acme.com";
		expect(isWorkspaceEmail("rep@acme.com")).toBe(true);
		expect(isWorkspaceEmail("someone-else@acme.com")).toBe(false);
	});
});
