import { describe, expect, it } from "bun:test";
import {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	hasSyncScopes,
	MICROSOFT_SYNC_SCOPES,
	OUTLOOK_MAIL_SCOPE,
	parseScopes,
	SYNC_SCOPES,
} from "@crm/auth/scopes";

const BOTH = `openid,email,profile,${GMAIL_SCOPE},${CALENDAR_SCOPE}`;

describe("parseScopes", () => {
	it("handles the comma form Better Auth stores", () => {
		expect(parseScopes("a,b,c")).toEqual(new Set(["a", "b", "c"]));
	});

	it("handles the space form Google returns", () => {
		expect(parseScopes("a b c")).toEqual(new Set(["a", "b", "c"]));
	});

	it("is empty for null, undefined and blank", () => {
		for (const value of [null, undefined, "", "   "]) {
			expect(parseScopes(value).size).toBe(0);
		}
	});

	it("reduces the Graph resource URI Microsoft returns to the bare permission", () => {
		expect(
			parseScopes(
				"openid profile https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read",
			),
		).toEqual(new Set(["openid", "profile", "Mail.Read", "User.Read"]));
	});
});

describe("hasSyncScopes for Google", () => {
	it("is true only when both scopes are present", () => {
		expect(hasSyncScopes("google", BOTH)).toBe(true);
	});

	it("is false when granular consent dropped one of them", () => {
		expect(hasSyncScopes("google", `openid,email,profile,${GMAIL_SCOPE}`)).toBe(
			false,
		);
		expect(
			hasSyncScopes("google", `openid,email,profile,${CALENDAR_SCOPE}`),
		).toBe(false);
	});

	it("is false for an account that predates the requirement", () => {
		expect(hasSyncScopes("google", "openid,email,profile")).toBe(false);
	});

	it("is false when the grant was revoked and the column cleared", () => {
		expect(hasSyncScopes("google", null)).toBe(false);
	});

	it("does not match on a prefix", () => {
		expect(
			hasSyncScopes("google", `${GMAIL_SCOPE}.metadata,${CALENDAR_SCOPE}`),
		).toBe(false);
	});

	it("covers exactly the scopes the provider requests", () => {
		expect(hasSyncScopes("google", SYNC_SCOPES.join(","))).toBe(true);
	});
});

describe("hasSyncScopes for Microsoft", () => {
	it("accepts the bare permission name", () => {
		expect(
			hasSyncScopes("microsoft", `openid profile ${OUTLOOK_MAIL_SCOPE}`),
		).toBe(true);
	});

	it("accepts the fully-qualified Graph form Microsoft actually returns", () => {
		expect(
			hasSyncScopes(
				"microsoft",
				"openid profile email https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read",
			),
		).toBe(true);
	});

	it("is false when only the sign-in scopes were granted", () => {
		expect(
			hasSyncScopes(
				"microsoft",
				"openid profile email https://graph.microsoft.com/User.Read",
			),
		).toBe(false);
	});

	it("covers exactly the scopes the provider requests", () => {
		expect(hasSyncScopes("microsoft", MICROSOFT_SYNC_SCOPES.join(","))).toBe(
			true,
		);
	});

	it("does not read a Google grant as a Microsoft one", () => {
		expect(hasSyncScopes("microsoft", BOTH)).toBe(false);
		expect(hasSyncScopes("google", OUTLOOK_MAIL_SCOPE)).toBe(false);
	});
});

describe("hasSyncScopes for anything else", () => {
	it("is false for a provider with no mailbox at all", () => {
		expect(hasSyncScopes("okta", BOTH)).toBe(false);
	});
});
