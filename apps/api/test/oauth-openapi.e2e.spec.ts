import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

const fallback = (key: string, value: string) => {
	if (!process.env[key]) process.env[key] = value;
};

fallback("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
fallback("API_URL", "http://localhost:3001");
fallback("ALLOWED_SIGN_IN", "example.com");
fallback("GOOGLE_CLIENT_ID", "test-google-client-id");
fallback("GOOGLE_CLIENT_SECRET", "test-google-client-secret");

describe("OAuth OpenAPI", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const { createApp } = await import("../src/create-app");
		app = await createApp();
	});

	afterAll(async () => {
		await app.close();
	});

	it("publishes cookie, API-key, and OAuth security schemes", async () => {
		const response = await request(app.getHttpServer())
			.get("/openapi.json")
			.expect(200);

		expect(response.body.components.securitySchemes).toMatchObject({
			apiKey: { type: "apiKey", name: "x-api-key", in: "header" },
			oauth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
		});
		expect(response.body.paths["/companies/{id}"].get.security).toEqual([
			{ cookie: [] },
			{ apiKey: [] },
			{ oauth: [] },
		]);
	});
});
