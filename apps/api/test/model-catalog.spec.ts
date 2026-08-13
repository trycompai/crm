import { afterEach, describe, expect, it } from "bun:test";
import type { Cache } from "cache-manager";
import { ModelCatalogService } from "../src/settings/model-catalog.service";

const cache = {
	get: async () => undefined,
	set: async () => undefined,
} as unknown as Cache;

const GATEWAY = {
	data: [
		{
			id: "zai/glm-5.2-fast",
			name: "GLM 5.2 Fast",
			owned_by: "zai",
			type: "language",
			tags: ["reasoning", "tool-use"],
			context_window: 1_000_000,
			pricing: { input: "0.0000004", output: "0.0000016" },
		},
		{
			id: "anthropic/claude-opus-5",
			name: "Claude Opus 5",
			owned_by: "anthropic",
			type: "language",
			tags: ["tool-use", "vision"],
			context_window: 1_000_000,
			pricing: null,
		},
		{
			id: "openai/dall-e",
			name: "Not a language model",
			owned_by: "openai",
			type: "image",
			tags: ["tool-use", "vision"],
			context_window: 4_000,
		},
	],
};

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

function serve(body: unknown, ok = true) {
	globalThis.fetch = (async () =>
		({
			ok,
			status: ok ? 200 : 503,
			json: async () => body,
		}) as unknown as Response) as unknown as typeof fetch;
}

describe("the model catalog", () => {
	it("marks a model that reads images", async () => {
		serve(GATEWAY);

		const models = await new ModelCatalogService(cache).models();
		const opus = models?.find(
			(model) => model.id === "anthropic/claude-opus-5",
		);

		expect(opus?.vision).toBe(true);
	});

	it("marks a model that cannot read images", async () => {
		serve(GATEWAY);

		const models = await new ModelCatalogService(cache).models();
		const glm = models?.find((model) => model.id === "zai/glm-5.2-fast");

		expect(glm?.vision).toBe(false);
	});

	it("keeps only language models the agent can call tools with", async () => {
		serve(GATEWAY);

		const models = await new ModelCatalogService(cache).models();

		expect(models?.map((model) => model.id)).toEqual([
			"anthropic/claude-opus-5",
			"zai/glm-5.2-fast",
		]);
	});

	it("reports the catalog as unavailable when the gateway refuses", async () => {
		serve({}, false);

		expect(await new ModelCatalogService(cache).models()).toBeNull();
	});
});
