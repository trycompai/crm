import { describe, expect, it } from "bun:test";
import {
	environmentOf,
	principalOf,
	recordsTraceContent,
	resolveTraceDestination,
} from "../agent/lib/tracing";
import { TRACING } from "../agent/lib/tracing-config";

describe("resolveTraceDestination", () => {
	it("is off when no API key is set", () => {
		const destination = resolveTraceDestination({});

		expect(destination.kind).toBe("off");
		expect(destination.label).toContain(TRACING.inference.keyVar);
	});

	it("treats a blank key as unset rather than exporting with no token", () => {
		expect(resolveTraceDestination({ INFERENCE_API_KEY: "" }).kind).toBe("off");
		expect(resolveTraceDestination({ INFERENCE_API_KEY: "   " }).kind).toBe(
			"off",
		);
	});

	it("sends to Inference once the key is set", () => {
		const destination = resolveTraceDestination({
			INFERENCE_API_KEY: "inf_live_123",
		});

		if (destination.kind !== "inference") throw new Error("expected an export");
		expect(destination.token).toBe("inf_live_123");
		expect(destination.endpoint).toBe(TRACING.inference.defaultEndpoint);
		expect(destination.serviceName).toBe(TRACING.inference.defaultServiceName);
	});

	it("never puts the token in the label a boot line prints", () => {
		const destination = resolveTraceDestination({
			INFERENCE_API_KEY: "inf_live_secret",
		});

		expect(destination.label).not.toContain("inf_live_secret");
	});

	it("takes a self-hosted endpoint over the default", () => {
		const destination = resolveTraceDestination({
			INFERENCE_API_KEY: "inf_live_123",
			INFERENCE_OTLP_ENDPOINT: "https://telemetry.internal.example",
		});

		if (destination.kind !== "inference") throw new Error("expected an export");
		expect(destination.endpoint).toBe("https://telemetry.internal.example");
	});

	it("takes a service name over the default, so deployments stay apart", () => {
		const destination = resolveTraceDestination({
			INFERENCE_API_KEY: "inf_live_123",
			INFERENCE_SERVICE_NAME: "crm-agent-staging",
		});

		if (destination.kind !== "inference") throw new Error("expected an export");
		expect(destination.serviceName).toBe("crm-agent-staging");
	});
});

describe("principalOf", () => {
	const human = (id: string) => ({ principalId: id, principalType: "user" });
	const service = { principalId: "eve:app", principalType: "runtime" };

	it("prefers the session initiator, so a subagent is attributed to the rep", () => {
		expect(
			principalOf({
				id: "session_1",
				auth: {
					initiator: human("user_root"),
					current: human("user_kid"),
				},
			}),
		).toBe("user_root");
	});

	it("falls back to the current principal", () => {
		expect(
			principalOf({ id: "session_1", auth: { current: human("user_kid") } }),
		).toBe("user_kid");
	});

	it("refuses the background runtime principal, which is not a person", () => {
		expect(
			principalOf({
				id: "session_1",
				auth: { initiator: service, current: service },
			}),
		).toBeNull();
	});

	it("finds the human when a background principal is also present", () => {
		expect(
			principalOf({
				id: "session_1",
				auth: { initiator: service, current: human("user_rep") },
			}),
		).toBe("user_rep");
	});

	it("reads an unauthenticated session as nobody rather than throwing", () => {
		expect(
			principalOf({
				id: "session_1",
				auth: { initiator: null, current: null },
			}),
		).toBeNull();
		expect(principalOf({ id: "session_1", auth: {} })).toBeNull();
		expect(principalOf({ id: "session_1" })).toBeNull();
	});

	it("refuses a shape it does not recognise", () => {
		expect(principalOf({ id: "session_1", auth: "nonsense" })).toBeNull();
		expect(
			principalOf({
				id: "session_1",
				auth: { initiator: { principalId: "x" } },
			}),
		).toBeNull();
	});
});

describe("environmentOf", () => {
	it("names the deployment environment for the dashboard facet", () => {
		expect(environmentOf({ NODE_ENV: "production" })).toBe("production");
	});

	it("defaults to development rather than leaving the facet blank", () => {
		expect(environmentOf({})).toBe("development");
	});
});

describe("what a span carries", () => {
	it("sends model inputs and outputs to the tracing vendor by default", () => {
		expect(recordsTraceContent({})).toBe(true);
		expect(TRACING.content.recordByDefault).toBe(true);
	});

	it("withholds them when the install asks it to", () => {
		for (const value of ["0", "false", "no", "off", "OFF", " false "]) {
			expect(recordsTraceContent({ INFERENCE_RECORD_CONTENT: value })).toBe(
				false,
			);
		}
	});

	it("keeps recording for any other value, so a typo cannot silence a trace", () => {
		for (const value of ["1", "true", "yes", "on", ""]) {
			expect(recordsTraceContent({ INFERENCE_RECORD_CONTENT: value })).toBe(
				true,
			);
		}
	});
});
