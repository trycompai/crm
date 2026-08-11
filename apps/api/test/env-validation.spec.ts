import "reflect-metadata";
import { describe, expect, it } from "bun:test";
import { validateEnv } from "../src/config/env.validation";

const base = {
	DATABASE_URL: "postgresql://localhost/crm",
	BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
};

describe("sign-in environment validation", () => {
	it("accepts exact addresses and domains", () => {
		expect(
			validateEnv({
				...base,
				ALLOWED_SIGN_IN: "admin@acme.com, angus@acme.com",
			}).ALLOWED_SIGN_IN,
		).toBe("admin@acme.com, angus@acme.com");
		expect(
			validateEnv({ ...base, ALLOWED_SIGN_IN: "acme.com" }).ALLOWED_SIGN_IN,
		).toBe("acme.com");
	});

	it("rejects empty and malformed allow-lists", () => {
		for (const value of [
			" ",
			"person@",
			"@",
			"bad host",
			"a@@acme.com",
			"com",
			"co.uk",
		]) {
			expect(() => validateEnv({ ...base, ALLOWED_SIGN_IN: value })).toThrow(
				"ALLOWED_SIGN_IN",
			);
		}
	});
});
