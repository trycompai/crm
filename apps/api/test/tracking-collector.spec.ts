import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { MAX_BODY_BYTES } from "@crm/db/tracking";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

describe("Tracking collector", () => {
	let app: INestApplication | undefined;
	const server = () => {
		if (!app) throw new Error("Tracking collector test app is not ready");
		return app.getHttpServer();
	};

	beforeAll(async () => {
		const { createApp } = await import("../src/create-app");

		app = await createApp();
		await app.init();
	});

	afterAll(async () => {
		await app?.close();
	});

	it("answers a beacon from another origin with a cross-origin CORP", async () => {
		const response = await request(server())
			.post("/api/t/e")
			.set("origin", "https://example.com")
			.set("content-type", "text/plain")
			.send(JSON.stringify({ siteId: "cmp_unknown", events: [] }));

		expect(response.status).toBe(204);
		expect(response.headers["cross-origin-resource-policy"]).toBe(
			"cross-origin",
		);
	});

	it("returns an opaque response for malformed runtime shapes", async () => {
		for (const value of [
			null,
			[],
			{},
			{ siteId: "cmp_1234abcd", visitorId: 42, events: [] },
			{ siteId: "cmp_1234abcd", visitorId: "visitor123", events: {} },
		]) {
			const response = await request(server())
				.post("/api/t/e")
				.set("origin", "https://example.com")
				.set("content-type", "text/plain")
				.send(JSON.stringify(value));

			expect(response.status).toBe(204);
			expect(response.text).toBe("");
		}
	});

	it("returns an opaque response for an oversized body", async () => {
		const response = await request(server())
			.post("/api/t/e")
			.set("origin", "https://example.com")
			.set("content-type", "text/plain")
			.send("x".repeat(MAX_BODY_BYTES + 1));

		expect(response.status).toBe(204);
		expect(response.text).toBe("");
	});
});
