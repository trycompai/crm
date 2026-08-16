import { describe, expect, it } from "bun:test";
import {
	devSessionLoginUrl,
	signDevSessionCookieValue,
	verifyDevSessionCookieValue,
} from "./dev-session.util";

const secret = "test-secret-at-least-32-characters-long";

describe("dev-session util", () => {
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
