import { describe, expect, it } from "bun:test";
import {
	createDevSessionResponse,
	localAppUrl,
	localLoginHost,
} from "../scripts/dev-session-http";

describe("dev session browser login", () => {
	it("sets the session cookie and redirects to the local app", () => {
		const response = createDevSessionResponse({
			appUrl: new URL("http://localhost:3000/tripwire"),
			cookieName: "crm.session_token",
			cookieValue: "signed%3D",
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"http://localhost:3000/tripwire",
		);
		expect(response.headers.get("set-cookie")).toBe(
			"crm.session_token=signed%3D; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800",
		);
	});

	it("uses the application loopback host for the login link", () => {
		expect(localLoginHost(new URL("http://127.0.0.1:3000"))).toBe("127.0.0.1");
		expect(localLoginHost(new URL("http://localhost:3000"))).toBe("localhost");
	});

	it("uses the first configured application origin", () => {
		expect(
			localAppUrl("http://localhost:3000,http://127.0.0.1:3000").toString(),
		).toBe("http://localhost:3000/");
	});

	it("refuses a non-local application URL", () => {
		expect(() => localLoginHost(new URL("https://crm.example.com"))).toThrow(
			"APP_URL must use localhost or 127.0.0.1 for dev:session.",
		);
	});
});
