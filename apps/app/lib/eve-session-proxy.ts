import {
	publicEveEventData,
	publicEveEventInput,
} from "@crm/validation/eve-public-event";
import { z } from "zod";
import { EVE_SESSION_PROXY } from "./eve-session-proxy-config";

const json = z.json();
const optionalJson = json.optional();
const identifier = z.string().min(1).max(256);

const inputResponse = z.object({
	requestId: identifier,
	optionId: z.string().max(1_024).optional(),
	text: z.string().max(65_536).optional(),
});

const createCommand = z.object({
	message: optionalJson,
	clientContext: optionalJson,
	outputSchema: optionalJson,
});

const sendCommand = z.object({
	message: optionalJson,
	inputResponses: z.array(inputResponse).max(100).optional(),
	turnPolicy: z.enum(["steer", "queue"]).optional(),
	clientContext: optionalJson,
	outputSchema: optionalJson,
});

const cancelCommand = z.object({ turnId: identifier.optional() });

const sessionId = z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);

export type EveProxyRoute =
	| { kind: "create"; sessionId: null }
	| { kind: "send"; sessionId: string }
	| { kind: "cancel"; sessionId: string }
	| { kind: "stream"; sessionId: string };

export function eveProxyRoute(request: Request): EveProxyRoute | null {
	const { pathname } = new URL(request.url);
	if (request.method === "POST" && pathname === "/eve/v1/session") {
		return { kind: "create", sessionId: null };
	}

	const match = pathname.match(
		/^\/eve\/v1\/session\/([^/]+)(?:\/(cancel|stream))?$/,
	);
	if (!match?.[1]) return null;

	let decoded: string;
	try {
		decoded = decodeURIComponent(match[1]);
	} catch {
		return null;
	}
	const parsedSession = sessionId.safeParse(decoded);
	if (!parsedSession.success) return null;

	if (request.method === "POST" && !match[2]) {
		return { kind: "send", sessionId: parsedSession.data };
	}
	if (request.method === "POST" && match[2] === "cancel") {
		return { kind: "cancel", sessionId: parsedSession.data };
	}
	if (request.method === "GET" && match[2] === "stream") {
		return { kind: "stream", sessionId: parsedSession.data };
	}
	return null;
}

const commandSchemas = {
	create: createCommand,
	send: sendCommand,
	cancel: cancelCommand,
} as const;

export async function eveProxyBody(
	request: Request,
	kind: "create" | "send" | "cancel",
): Promise<string | null> {
	const text = await request.text();
	if (
		new TextEncoder().encode(text).byteLength >
		EVE_SESSION_PROXY.request.maxBodyBytes
	) {
		throw new EveProxyRequestError(413, "The request is too large.");
	}

	let value: z.infer<typeof json> = {};
	if (text.trim()) {
		try {
			value = json.parse(JSON.parse(text));
		} catch {
			throw new EveProxyRequestError(400, "The request body is invalid.");
		}
	}

	const parsed = commandSchemas[kind].safeParse(value);
	if (!parsed.success) {
		throw new EveProxyRequestError(400, "The request body is invalid.");
	}
	const serialized = JSON.stringify(parsed.data);
	return serialized === "{}" ? null : serialized;
}

export function eveProxyBuilderSendAllowed(body: string | null): boolean {
	if (!body) return false;

	const parsed = sendCommand.safeParse(JSON.parse(body));
	return (
		parsed.success &&
		Object.keys(parsed.data).every((key) => key === "inputResponses") &&
		(parsed.data.inputResponses?.length ?? 0) > 0
	);
}

const streamQueryNames = [
	"startIndex",
	"includeTailIndex",
	"streamControlVersion",
] as const;

export function eveProxyTargetUrl(request: Request, agentUrl: string): URL {
	const incoming = new URL(request.url);
	const target = new URL(incoming.pathname, agentUrl);
	for (const name of streamQueryNames) {
		const value = incoming.searchParams.get(name);
		if (value !== null) target.searchParams.set(name, value);
	}
	return target;
}

const responseHeaderNames = [
	"content-type",
	"cache-control",
	"retry-after",
	"x-accel-buffering",
	"x-eve-session-id",
	"x-eve-stream-format",
	"x-eve-stream-version",
	"x-eve-stream-tail-index",
] as const;

export function eveProxyResponseHeaders(source: Headers): Headers {
	const headers = new Headers();
	for (const name of responseHeaderNames) {
		const value = source.get(name);
		if (value !== null) headers.set(name, value);
	}
	return headers;
}

const agentResponse = z.object({
	ok: z.boolean().optional(),
	sessionId: sessionId.optional(),
	status: z.enum(["accepted", "no_active_turn"]).optional(),
	deliveryId: identifier.optional(),
});

export function eveProxyAgentResponse(value: z.infer<typeof json>) {
	return agentResponse.parse(value);
}

export function eveProxySessionId(value: string | null): string | null {
	return sessionId.safeParse(value).data ?? null;
}

const messageText = z
	.union([
		z.string(),
		z
			.array(
				z.discriminatedUnion("type", [
					z.object({ type: z.literal("text"), text: z.string() }),
					z.object({ type: z.literal("file") }),
					z.object({ type: z.literal("image") }),
				]),
			)
			.transform((parts) =>
				parts
					.filter((part) => part.type === "text")
					.map((part) => part.text)
					.join(" "),
			),
	])
	.catch("");

export function eveProxyMessageTitle(body: string | null): string | null {
	if (!body) return null;
	const parsed = createCommand.safeParse(JSON.parse(body));
	if (!parsed.success) return null;
	const text = messageText.parse(parsed.data.message).trim();
	return text ? text.slice(0, 120) : null;
}

const eventEnvelope = z.object({
	type: z.string(),
	data: publicEveEventInput,
	meta: z
		.object({
			id: identifier.optional(),
			at: z.string().max(128),
			deliveryIds: z.array(identifier).max(100).optional(),
		})
		.optional(),
});

const streamControl = z.object({
	$eve: z.literal("stream.lease-ended"),
	version: z.literal(1),
});

export function eveProxyEventLine(line: string): string {
	if (!line.trim()) return "";

	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		throw new Error("The agent stream contains invalid JSON.");
	}

	const control = streamControl.safeParse(value);
	if (control.success) return JSON.stringify(control.data);

	const event = eventEnvelope.safeParse(value);
	if (!event.success)
		throw new Error("The agent stream contains an invalid event.");

	const { type, meta } = event.data;
	const safe = publicEveEventData(type, event.data.data);
	return JSON.stringify({
		type: safe.type,
		meta,
		data: safe.data,
	});
}

export function eveProxyStream(
	body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let pending = "";

	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				pending += decoder.decode(chunk, { stream: true });
				const lines = pending.split("\n");
				pending = lines.pop() ?? "";
				if (
					encoder.encode(pending).byteLength >
					EVE_SESSION_PROXY.stream.maxLineBytes
				) {
					throw new Error("The agent stream line is too large.");
				}
				for (const line of lines) {
					if (
						encoder.encode(line).byteLength >
						EVE_SESSION_PROXY.stream.maxLineBytes
					) {
						throw new Error("The agent stream line is too large.");
					}
					controller.enqueue(encoder.encode(`${eveProxyEventLine(line)}\n`));
				}
			},
			flush(controller) {
				pending += decoder.decode();
				if (
					encoder.encode(pending).byteLength >
					EVE_SESSION_PROXY.stream.maxLineBytes
				) {
					throw new Error("The agent stream line is too large.");
				}
				if (pending)
					controller.enqueue(encoder.encode(eveProxyEventLine(pending)));
			},
		}),
	);
}

export class EveProxyRequestError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "EveProxyRequestError";
	}
}
