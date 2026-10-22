import { afterEach, describe, expect, it } from "bun:test";
import {
	googleHostedDomainHint,
	hasSignInAllowList,
	isWorkspaceEmail,
	primaryWorkspaceDomain,
} from "../src/workspace";

const originalAllowList = process.env.ALLOWED_SIGN_IN;

afterEach(() => {
	if (originalAllowList === undefined) delete process.env.ALLOWED_SIGN_IN;
	else process.env.ALLOWED_SIGN_IN = originalAllowList;
});

describe("Google hosted-domain hint", () => {
	it("uses the configured domain", () => {
		process.env.ALLOWED_SIGN_IN = "acme.com";
		expect(googleHostedDomainHint()).toBe("acme.com");
	});

	it("uses the common host from an address-only allow-list", () => {
		process.env.ALLOWED_SIGN_IN = "owner@acme.com,rep@acme.com";
		expect(googleHostedDomainHint()).toBe("acme.com");
	});

	it("withholds the hint when allowed addresses use different hosts", () => {
		process.env.ALLOWED_SIGN_IN = "owner@acme.com,rep@beta.com";
		expect(googleHostedDomainHint()).toBeUndefined();
	});

	it("does not widen access for an address-only allow-list", () => {
		process.env.ALLOWED_SIGN_IN = "owner@acme.com";
		expect(googleHostedDomainHint()).toBe("acme.com");
		expect(primaryWorkspaceDomain()).toBeUndefined();
		expect(isWorkspaceEmail("other@acme.com")).toBe(false);
	});
});

describe("malformed allow-list hosts", () => {
	it.each([
		"https://acme.com",
		"-acme.com",
		"acme..com",
		"owner@acme..com",
		"owner@@acme.com",
	])("rejects %s", (entry) => {
		process.env.ALLOWED_SIGN_IN = entry;
		expect(hasSignInAllowList()).toBe(false);
		expect(googleHostedDomainHint()).toBeUndefined();
	});

	it.each(["owner@-acme.com", "owner@acme..com", "owner @acme.com"])(
		"rejects the sign-in address %s",
		(email) => {
			process.env.ALLOWED_SIGN_IN = email;
			expect(isWorkspaceEmail(email)).toBe(false);
		},
	);
});
