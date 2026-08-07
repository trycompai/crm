import { afterEach, describe, expect, it } from "bun:test";
import { MailboxApiClient } from "../src/mailbox/mailbox-api.client";

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

function stub(
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
): void {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json", ...headers },
		})) as unknown as typeof fetch;
}

const client = new MailboxApiClient();
const call = () => client.get<unknown>("https://example.test/x", "token");

describe("MailboxApiClient", () => {
	it("returns the payload on success", async () => {
		stub(200, { ok: true });
		expect(await call()).toEqual({ outcome: "ok", data: { ok: true } });
	});

	it("maps Gmail's 404 to cursor-invalid", async () => {
		stub(404, { error: { message: "Requested entity was not found." } });
		const result = await call();
		expect(result.outcome).toBe("cursor-invalid");
	});

	it("maps Calendar's 410 to cursor-invalid", async () => {
		stub(410, { error: { message: "Sync token is no longer valid." } });
		const result = await call();
		expect(result.outcome).toBe("cursor-invalid");
	});

	it("maps 401 to unauthorized, so the row can be marked for reconnect", async () => {
		stub(401, { error: { message: "Invalid Credentials" } });
		expect((await call()).outcome).toBe("unauthorized");
	});

	it("treats a quota 403 as rate limiting, not a hard failure", async () => {
		stub(403, { error: { message: "User Rate Limit Exceeded" } });
		const result = await call();

		expect(result.outcome).toBe("rate-limited");
		if (result.outcome === "rate-limited") {
			expect(result.retryAfterMs).toBeGreaterThan(0);
		}
	});

	it("treats a permission 403 as terminal", async () => {
		stub(403, { error: { message: "Insufficient Permission" } });
		const result = await call();

		expect(result.outcome).toBe("failed");
		if (result.outcome === "failed") expect(result.retryable).toBe(false);
	});

	it("honours Retry-After on a 429", async () => {
		stub(
			429,
			{ error: { message: "Too many requests" } },
			{ "retry-after": "600" },
		);
		const result = await call();

		expect(result.outcome).toBe("rate-limited");
		if (result.outcome === "rate-limited") {
			expect(result.retryAfterMs).toBe(600_000);
		}
	});

	it("marks 5xx retryable and 4xx not", async () => {
		stub(503, { error: { message: "Backend error" } });
		const server = await call();
		expect(server.outcome === "failed" && server.retryable).toBe(true);

		stub(400, { error: { message: "Bad request" } });
		const client400 = await call();
		expect(client400.outcome === "failed" && client400.retryable).toBe(false);
	});

	it("surfaces a network error as retryable rather than throwing", async () => {
		globalThis.fetch = (async () => {
			throw new Error("connect ECONNREFUSED");
		}) as unknown as typeof fetch;

		const result = await call();
		expect(result.outcome).toBe("failed");
		if (result.outcome === "failed") expect(result.retryable).toBe(true);
	});
});
