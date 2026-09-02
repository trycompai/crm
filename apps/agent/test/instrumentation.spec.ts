import { afterAll, describe, expect, it } from "bun:test";

const REAL_KEY = process.env.INFERENCE_API_KEY;
const REAL_RECORD = process.env.INFERENCE_RECORD_CONTENT;

afterAll(() => {
	if (REAL_KEY === undefined) delete process.env.INFERENCE_API_KEY;
	else process.env.INFERENCE_API_KEY = REAL_KEY;
	if (REAL_RECORD === undefined) delete process.env.INFERENCE_RECORD_CONTENT;
	else process.env.INFERENCE_RECORD_CONTENT = REAL_RECORD;
});

type Instrumentation = typeof import("../agent/instrumentation")["default"];

async function instrumentation(tag: string): Promise<Instrumentation> {
	const loaded = (await import(`../agent/instrumentation?${tag}`)) as {
		default: Instrumentation;
	};

	return loaded.default;
}

describe("the instrumentation handed to the tracing SDK", () => {
	it("withholds content when the install asks it to", async () => {
		process.env.INFERENCE_API_KEY = "test-key";
		process.env.INFERENCE_RECORD_CONTENT = "0";

		const config = await instrumentation("withheld");

		expect(config.recordInputs).toBe(false);
		expect(config.recordOutputs).toBe(false);
	});

	it("records content when the install says nothing", async () => {
		process.env.INFERENCE_API_KEY = "test-key";
		delete process.env.INFERENCE_RECORD_CONTENT;

		const config = await instrumentation("recorded");

		expect(config.recordInputs).toBe(true);
		expect(config.recordOutputs).toBe(true);
	});
});
