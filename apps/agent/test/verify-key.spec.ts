import { describe, expect, it } from "bun:test";
import { APIError } from "context.dev/core/error";
import { classifyKey } from "../agent/lib/context-dev";

const answered = (status: number, code?: string) =>
	new APIError(
		status,
		code ? { error_code: code } : undefined,
		undefined,
		new Headers(),
	);

describe("checking a Context key", () => {
	it("rejects only the answer that means the key is wrong", () => {
		const check = classifyKey(answered(401));

		expect(check.outcome).toBe("invalid");
		expect(check.outcome === "invalid" && check.reason).toContain(
			"did not recognise",
		);
	});

	it("accepts the refusal of the probe itself", () => {
		expect(classifyKey(answered(422, "FREE_EMAIL_DETECTED")).outcome).toBe(
			"valid",
		);
	});

	it("accepts a key that authenticated but is out of quota or off-plan", () => {
		expect(classifyKey(answered(403, "USAGE_EXCEEDED")).outcome).toBe("valid");
		expect(classifyKey(answered(403, "FORBIDDEN")).outcome).toBe("valid");
	});

	it("accepts an exhausted free-tier key when Context answers with 401", () => {
		expect(classifyKey(answered(401, "USAGE_EXCEEDED")).outcome).toBe("valid");
		expect(
			classifyKey(
				new APIError(
					401,
					{ message: "This account has no API credits remaining." },
					undefined,
					new Headers(),
				),
			).outcome,
		).toBe("valid");
	});

	it("accepts a key when Context itself is having a bad day", () => {
		for (const status of [429, 500, 502, 503]) {
			expect(classifyKey(answered(status)).outcome).toBe("valid");
		}
	});

	it("cannot tell when the request never reached Context", () => {
		const check = classifyKey(new Error("connect ECONNREFUSED"));

		expect(check.outcome).toBe("unknown");
		expect(check.outcome === "unknown" && check.reason).toContain(
			"ECONNREFUSED",
		);
	});

	it("cannot tell when the error carries no status at all", () => {
		expect(
			classifyKey(new APIError(undefined, undefined, "aborted", new Headers()))
				.outcome,
		).toBe("unknown");
	});

	it("never reports a bare network failure as a bad key", () => {
		for (const error of [
			new Error("The operation timed out."),
			new TypeError("fetch failed"),
			"a string nobody expected",
		]) {
			expect(classifyKey(error).outcome).not.toBe("invalid");
		}
	});
});
