import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import {
	bufferedProxyResponse,
	responseCanHaveBody,
} from "../lib/api-proxy-response";

describe("API proxy responses", () => {
	test("does not attach a body where HTTP forbids one", async () => {
		for (const [method, status] of [
			["HEAD", 200],
			["GET", 204],
			["GET", 205],
			["GET", 304],
		] as const) {
			expect(responseCanHaveBody(method, status)).toBe(false);
			const response = await bufferedProxyResponse(
				new Response(null, { status }),
				new Headers(),
				method,
			);
			expect(response.body).toBeNull();
			expect(response.status).toBe(status);
		}
	});

	test("forwards non-success responses with their body", async () => {
		const response = await bufferedProxyResponse(
			Response.json({ error: "invalid" }, { status: 422 }),
			new Headers({ "content-type": "application/json" }),
			"POST",
		);

		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ error: "invalid" });
	});

	test("decodes compressed upstream bodies after stripping encoding headers", async () => {
		const response = await bufferedProxyResponse(
			new Response(gzipSync("hello"), {
				headers: { "content-encoding": "gzip" },
			}),
			new Headers({ "content-encoding": "gzip" }),
			"GET",
		);

		expect(await response.text()).toBe("hello");
		expect(response.headers.has("content-encoding")).toBe(false);
	});
});
