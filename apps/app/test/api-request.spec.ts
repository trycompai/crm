import { afterEach, describe, expect, it } from "bun:test";
import { apiRequestHeaders } from "../lib/api-request.server";

const originalSecret = process.env.API_PROTECTION_BYPASS_SECRET;

afterEach(() => {
	if (originalSecret === undefined) {
		delete process.env.API_PROTECTION_BYPASS_SECRET;
	} else {
		process.env.API_PROTECTION_BYPASS_SECRET = originalSecret;
	}
});

describe("API request headers", () => {
	it("preserves headers without a protection bypass secret", () => {
		delete process.env.API_PROTECTION_BYPASS_SECRET;

		const headers = apiRequestHeaders({ accept: "application/json" });

		expect(headers.get("accept")).toBe("application/json");
		expect(headers.has("x-vercel-protection-bypass")).toBe(false);
	});

	it("adds the protection bypass secret to server requests", () => {
		process.env.API_PROTECTION_BYPASS_SECRET = "staging-secret";

		const headers = apiRequestHeaders({ cookie: "session=value" });

		expect(headers.get("cookie")).toBe("session=value");
		expect(headers.get("x-vercel-protection-bypass")).toBe("staging-secret");
	});
});
