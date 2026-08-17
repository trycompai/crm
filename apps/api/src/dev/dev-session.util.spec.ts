import { describe, expect, it } from "bun:test";
import {
	devSessionLoginUrl,
	isDevSessionRouteEnabled,
	signDevSessionCookieValue,
	verifyDevSessionCookieValue,
} from "./dev-session.util";

const secret = "test-secret-at-least-32-characters-long";

describe("dev-session util", () => {
	it("enables the login route only in development", () => {
		const previous = process.env.NODE_ENV;
		try {
			delete process.env.NODE_ENV;
			expect(isDevSessionRouteEnabled()).toBe(true);

			process.env.NODE_ENV = "development";
			expect(isDevSessionRouteEnabled()).toBe(true);

			process.env.NODE_ENV = "test";
			expect(isDevSessionRouteEnabled()).toBe(false);

			process.env.NODE_ENV = "production";
			expect(isDevSessionRouteEnabled()).toBe(false);
		} finally {
			if (previous === undefined) {
				delete process.env.NODE_ENV;
			} else {
				process.env.NODE_ENV = previous;
			}
		}
	});

	it("signs and verifies a session token", async () => {
		const signed = await signDevSessionCookieValue("dev-session-user", secret);
		await expect(verifyDevSessionCookieValue(signed, secret)).resolves.toBe(
			"dev-session-user",
		);
	});

	it("rejects a tampered session token", async () => {
		const signed = await signDevSessionCookieValue("dev-session-user", secret);
		await expect(
			verifyDevSessionCookieValue(`${signed}x`, secret),
		).rejects.toThrow("Invalid dev session cookie.");
	});

	it("builds a login URL on the app origin", async () => {
		const signed = await signDevSessionCookieValue("dev-session-user", secret);
		expect(devSessionLoginUrl("http://localhost:3000", signed)).toBe(
			`http://localhost:3000/api/dev/session-login?session=${signed}`,
		);
	});
});
