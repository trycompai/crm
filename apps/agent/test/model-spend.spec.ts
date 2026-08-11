import { afterEach, describe, expect, it } from "bun:test";
import rootGate from "../agent/hooks/model-spend";
import {
	assertModelSpendAllowed,
	modelSpendPaused,
} from "../agent/lib/autonomy";
import { ask, perplexityEnabled } from "../agent/lib/perplexity";
import builderGate from "../agent/subagents/agent_builder/hooks/model-spend";
import runnerGate from "../agent/subagents/agent_runner/hooks/model-spend";

const keys = [
	"AI_GATEWAY_API_KEY",
	"AI_GATEWAY_SPEND_PAUSED",
	"PERPLEXITY_API_KEY",
	"VERCEL_ENV",
] as const;
const originalEnv = new Map(keys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function restoreEnv(): void {
	for (const key of keys) {
		const value = originalEnv.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

function stepHandler(gate: typeof rootGate): () => void {
	return gate.events["step.started"] as unknown as () => void;
}

afterEach(() => {
	restoreEnv();
	globalThis.fetch = originalFetch;
});

describe("model spend gate", () => {
	it("requires the exact false value", () => {
		delete process.env.VERCEL_ENV;
		for (const value of [undefined, "true", "FALSE", " false "]) {
			if (value === undefined) delete process.env.AI_GATEWAY_SPEND_PAUSED;
			else process.env.AI_GATEWAY_SPEND_PAUSED = value;

			expect(modelSpendPaused()).toBe(true);
			expect(assertModelSpendAllowed).toThrow("Model spend is paused.");
		}

		process.env.AI_GATEWAY_SPEND_PAUSED = "false";
		expect(modelSpendPaused()).toBe(false);
		expect(assertModelSpendAllowed).not.toThrow();
	});

	it("requires a dedicated Gateway key in Vercel production", () => {
		process.env.AI_GATEWAY_SPEND_PAUSED = "false";
		process.env.VERCEL_ENV = "production";
		delete process.env.AI_GATEWAY_API_KEY;

		expect(modelSpendPaused()).toBe(true);

		process.env.AI_GATEWAY_API_KEY = "configured";
		expect(modelSpendPaused()).toBe(false);
	});

	it("blocks every Eve model scope before a step", () => {
		process.env.AI_GATEWAY_SPEND_PAUSED = "true";

		for (const gate of [rootGate, builderGate, runnerGate]) {
			expect(stepHandler(gate)).toThrow("Model spend is paused.");
		}
	});

	it("blocks Perplexity before any network request", async () => {
		process.env.AI_GATEWAY_SPEND_PAUSED = "true";
		process.env.PERPLEXITY_API_KEY = "configured";
		let requests = 0;
		globalThis.fetch = (async () => {
			requests += 1;
			return new Response(null, { status: 500 });
		}) as typeof fetch;

		expect(perplexityEnabled()).toBe(false);
		expect(await ask("Do not send this.")).toEqual({
			ok: false,
			reason: "Model spend is paused.",
		});
		expect(requests).toBe(0);
	});
});
