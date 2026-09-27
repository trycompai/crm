import { describe, expect, it } from "bun:test";
import "reflect-metadata";
import { validateEnv } from "../src/config/env.validation";

const required = {
	DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/crm",
	BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
	ALLOWED_SIGN_IN: "example.com",
};

describe("environment validation", () => {
	it("allows the bridge secret to be absent", () => {
		expect(validateEnv(required).AGENT_BRIDGE_SECRET).toBeUndefined();
	});

	it("treats an empty bridge secret as an unset optional value", () => {
		expect(
			validateEnv({ ...required, AGENT_BRIDGE_SECRET: "" }).AGENT_BRIDGE_SECRET,
		).toBe("");
	});

	it("requires configured bridge secrets to be at least 32 characters", () => {
		expect(() =>
			validateEnv({ ...required, AGENT_BRIDGE_SECRET: "too-short" }),
		).toThrow("AGENT_BRIDGE_SECRET must be at least 32 characters");
	});
});
