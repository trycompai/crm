import { describe, expect, it } from "bun:test";

process.env.API_URL = "https://crm.example.test";

const { canConfigureSso, ssoCallbackBase, ssoCallbackURL, ssoProviderName } =
	await import("../src/sso");

describe("canConfigureSso", () => {
	it("is the same answer as renaming the workspace", () => {
		expect(canConfigureSso("owner")).toBe(true);
		expect(canConfigureSso("admin")).toBe(true);
		expect(canConfigureSso("member")).toBe(false);
		expect(canConfigureSso(null)).toBe(false);
	});
});

describe("ssoCallbackURL", () => {
	it("is the API origin plus the path better-auth mounts the callback on", () => {
		expect(ssoCallbackURL("okta")).toBe(
			"https://crm.example.test/api/auth/sso/callback/okta",
		);
	});

	it("hangs off the base the settings page shows", () => {
		expect(ssoCallbackBase()).toBe(
			"https://crm.example.test/api/auth/sso/callback",
		);
	});
});

describe("ssoProviderName", () => {
	it("reads as a button on the sign-in page", () => {
		expect(ssoProviderName("okta")).toBe("Okta");
		expect(ssoProviderName("entra-id")).toBe("Entra Id");
		expect(ssoProviderName("jump_cloud")).toBe("Jump Cloud");
	});

	it("leaves an acronym alone", () => {
		expect(ssoProviderName("ADFS")).toBe("ADFS");
	});
});
