import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
	EveProxyRequestError,
	eveProxyAgentResponse,
	eveProxyBody,
	eveProxyBuilderSendAllowed,
	eveProxyEventLine,
	eveProxyResponseHeaders,
	eveProxyRoute,
	eveProxySessionId,
	eveProxyStream,
	eveProxyTargetUrl,
} from "../lib/eve-session-proxy";

const testJson = z.json();
type TestJson = z.infer<typeof testJson>;

const request = (path: string, method = "GET", body?: TestJson) =>
	new Request(`http://localhost${path}`, {
		method,
		body: body === undefined ? undefined : JSON.stringify(body),
	});

const event = (type: string, data: TestJson) =>
	JSON.stringify({
		type,
		data,
		meta: {
			id: "evt_01",
			at: "2026-10-20T12:00:00.000Z",
			deliveryIds: ["delivery_01"],
		},
	});

describe("Eve session routes", () => {
	it("allows only the chat operations", () => {
		expect(eveProxyRoute(request("/eve/v1/session", "POST"))).toEqual({
			kind: "create",
			sessionId: null,
		});
		expect(eveProxyRoute(request("/eve/v1/session/wrun_01", "POST"))).toEqual({
			kind: "send",
			sessionId: "wrun_01",
		});
		expect(
			eveProxyRoute(request("/eve/v1/session/wrun_01/cancel", "POST")),
		).toEqual({
			kind: "cancel",
			sessionId: "wrun_01",
		});
		expect(eveProxyRoute(request("/eve/v1/session/wrun_01/stream"))).toEqual({
			kind: "stream",
			sessionId: "wrun_01",
		});
	});

	it("rejects undeclared methods and operations", () => {
		expect(eveProxyRoute(request("/eve/v1/session", "DELETE"))).toBeNull();
		expect(
			eveProxyRoute(request("/eve/v1/session/wrun_01/compact", "POST")),
		).toBeNull();
		expect(
			eveProxyRoute(request("/eve/v1/session/wrun_01/stream", "POST")),
		).toBeNull();
		expect(eveProxyRoute(request("/eve/v1/info"))).toBeNull();
		expect(eveProxyRoute(request("/eve/v1/session/%2F", "POST"))).toBeNull();
	});
});

describe("Eve command requests", () => {
	it("allows only structured builder input responses", async () => {
		const message = await eveProxyBody(
			request("/eve/v1/session/wrun_01", "POST", {
				message: "Bypass the durable queue.",
			}),
			"send",
		);
		const response = await eveProxyBody(
			request("/eve/v1/session/wrun_01", "POST", {
				inputResponses: [{ requestId: "request_01", optionId: "approve" }],
			}),
			"send",
		);

		expect(eveProxyBuilderSendAllowed(message)).toBe(false);
		expect(eveProxyBuilderSendAllowed(response)).toBe(true);
		expect(
			eveProxyBuilderSendAllowed(
				JSON.stringify({
					inputResponses: [{ requestId: "request-1", text: "Primary" }],
					clientContext: { bypass: true },
				}),
			),
		).toBe(false);
		expect(eveProxyBuilderSendAllowed(null)).toBe(false);
	});

	it("keeps declared message fields and drops relay controls", async () => {
		const body = await eveProxyBody(
			request("/eve/v1/session", "POST", {
				message: "Summarize this record.",
				clientContext: { page: "contact" },
				callback: "https://attacker.example/callback",
				operationId: "reuse-another-session",
				capabilities: ["admin"],
			}),
			"create",
		);

		expect(JSON.parse(body ?? "null")).toEqual({
			message: "Summarize this record.",
			clientContext: { page: "contact" },
		});
	});

	it("keeps structured responses and drops unknown response fields", async () => {
		const body = await eveProxyBody(
			request("/eve/v1/session/wrun_01", "POST", {
				inputResponses: [
					{
						requestId: "request_01",
						optionId: "approve",
						administrator: true,
					},
				],
				turnPolicy: "queue",
			}),
			"send",
		);

		expect(JSON.parse(body ?? "null")).toEqual({
			inputResponses: [{ requestId: "request_01", optionId: "approve" }],
			turnPolicy: "queue",
		});
	});

	it("preserves text and file attachments", async () => {
		const message: TestJson = [
			{ type: "text", text: "Review this file." },
			{
				type: "file",
				filename: "contract.pdf",
				mediaType: "application/pdf",
				data: "data:application/pdf;base64,ZmFrZQ==",
			},
		];
		const body = await eveProxyBody(
			request("/eve/v1/session", "POST", { message }),
			"create",
		);

		expect(JSON.parse(body ?? "null")).toEqual({ message });
	});

	it("rejects invalid response input", async () => {
		const promise = eveProxyBody(
			request("/eve/v1/session/wrun_01", "POST", {
				inputResponses: [{ optionId: "approve" }],
			}),
			"send",
		);

		expect(promise).rejects.toBeInstanceOf(EveProxyRequestError);
	});

	it("forwards only stream cursor queries", () => {
		const target = eveProxyTargetUrl(
			request(
				"/eve/v1/session/wrun_01/stream?startIndex=7&includeTailIndex=true&streamControlVersion=1&callback=https://attacker.example",
			),
			"http://agent.internal:3001",
		);

		expect(target.toString()).toBe(
			"http://agent.internal:3001/eve/v1/session/wrun_01/stream?startIndex=7&includeTailIndex=true&streamControlVersion=1",
		);
	});
});

describe("Eve responses", () => {
	it("keeps only browser-safe response headers", () => {
		const headers = eveProxyResponseHeaders(
			new Headers({
				"content-type": "application/json",
				"retry-after": "5",
				"set-cookie": "agent-secret=1",
				server: "internal-agent",
				"x-eve-session-id": "wrun_01",
			}),
		);

		expect(Object.fromEntries(headers)).toEqual({
			"content-type": "application/json",
			"retry-after": "5",
			"x-eve-session-id": "wrun_01",
		});
	});

	it("drops undeclared response data", () => {
		expect(
			eveProxyAgentResponse({
				ok: true,
				sessionId: "wrun_01",
				internalCallbackToken: "secret",
			}),
		).toEqual({ ok: true, sessionId: "wrun_01" });
		expect(eveProxySessionId("../secret")).toBeNull();
	});
});

describe("Eve public stream", () => {
	it("keeps declared event data and cursor metadata", () => {
		const line = eveProxyEventLine(
			event("message.completed", {
				turnId: "turn_01",
				sequence: 3,
				stepIndex: 1,
				message: "Done.",
				finishReason: "stop",
				providerMetadata: { secret: true },
			}),
		);

		expect(JSON.parse(line)).toEqual({
			type: "message.completed",
			data: {
				turnId: "turn_01",
				sequence: 3,
				stepIndex: 1,
				message: "Done.",
				finishReason: "stop",
			},
			meta: {
				id: "evt_01",
				at: "2026-10-20T12:00:00.000Z",
				deliveryIds: ["delivery_01"],
			},
		});
	});

	it("replaces unknown events without changing their cursor position", () => {
		const line = eveProxyEventLine(
			event("internal.checkpoint", { token: "secret" }),
		);

		expect(JSON.parse(line)).toEqual({
			type: "event.ignored",
			data: {},
			meta: {
				id: "evt_01",
				at: "2026-10-20T12:00:00.000Z",
				deliveryIds: ["delivery_01"],
			},
		});
	});

	it("redacts failed action and task details", () => {
		const action = JSON.parse(
			eveProxyEventLine(
				event("action.result", {
					turnId: "turn_01",
					sequence: 4,
					stepIndex: 1,
					status: "failed",
					result: {
						kind: "tool-result",
						callId: "call_01",
						toolName: "crm_search",
						output: { stack: "database password" },
						isError: true,
					},
					error: { message: "database password" },
				}),
			),
		);
		const task = JSON.parse(
			eveProxyEventLine(
				event("task.settled", {
					turnId: "turn_01",
					callId: "call_02",
					taskId: "task_01",
					kind: "agent",
					name: "researcher",
					status: "failed",
					error: { message: "internal service token" },
				}),
			),
		);

		expect(action.data.result.output).toBeNull();
		expect(action.data.error.message).toBe(
			"The agent could not complete this action.",
		);
		expect(task.data.error.message).toBe(
			"The agent could not complete this task.",
		);
	});

	it("drops remote agent routing data", () => {
		const line = eveProxyEventLine(
			event("agent.started", {
				turnId: "turn_01",
				callId: "call_01",
				name: "researcher",
				sessionId: "wrun_child",
				streamPath: "/eve/v1/session/wrun_child/stream",
				remote: {
					url: "https://private-agent.example",
					resolverId: "secret-resolver",
				},
			}),
		);

		expect(JSON.parse(line).data).toEqual({
			turnId: "turn_01",
			callId: "call_01",
			name: "researcher",
			sessionId: "wrun_child",
			streamPath: "/eve/v1/session/wrun_child/stream",
		});
	});

	it("rejects unsafe authorization links", () => {
		const line = eveProxyEventLine(
			event("authorization.required", {
				turnId: "turn_01",
				sequence: 2,
				stepIndex: 1,
				name: "linear",
				description: "Connect Linear.",
				authorization: { url: "javascript:alert(1)" },
			}),
		);

		expect(JSON.parse(line).type).toBe("event.ignored");
	});

	it("sanitizes split chunks and keeps transport controls", async () => {
		const first = event("session.started", {});
		const second = event("private.event", { secret: true });
		const source = new ReadableStream<Uint8Array>({
			start(controller) {
				const bytes = new TextEncoder().encode(
					`${first}\n${JSON.stringify({ $eve: "stream.lease-ended", version: 1 })}\n${second}\n`,
				);
				controller.enqueue(bytes.slice(0, 17));
				controller.enqueue(bytes.slice(17));
				controller.close();
			},
		});
		const text = await new Response(eveProxyStream(source)).text();
		const lines = text
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		expect(lines.map((line) => line.type ?? line.$eve)).toEqual([
			"session.started",
			"stream.lease-ended",
			"event.ignored",
		]);
	});
});
