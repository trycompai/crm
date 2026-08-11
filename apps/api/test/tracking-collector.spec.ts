import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

describe("Tracking collector", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const { createApp } = await import("../src/create-app");

		app = await createApp();
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	it("answers a beacon from another origin with a cross-origin CORP", async () => {
		const response = await request(app.getHttpServer())
			.post("/api/t/e")
			.set("origin", "https://example.com")
			.set("content-type", "text/plain")
			.send(JSON.stringify({ siteId: "cmp_unknown", events: [] }));

		expect(response.status).toBe(204);
		expect(response.headers["cross-origin-resource-policy"]).toBe(
			"cross-origin",
		);
	});
});
