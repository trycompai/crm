import { db } from "@crm/db";
import { connection } from "next/server";
import { z } from "zod";
import {
	AGENT_URL,
	bridgeConfigured,
	mintBridgeToken,
} from "@/lib/agent-bridge";
import {
	EveProxyRequestError,
	eveProxyAgentResponse,
	eveProxyBody,
	eveProxyBuilderSendAllowed,
	eveProxyMessageTitle,
	eveProxyResponseHeaders,
	eveProxyRoute,
	eveProxySessionId,
	eveProxyStream,
	eveProxyTargetUrl,
} from "@/lib/eve-session-proxy";
import { getSession } from "@/lib/session";

const recordId = z.string().regex(/^[a-z0-9]{20,32}$/);

type RecordContext = {
	contactId?: string;
	companyId?: string;
	dealId?: string;
};

async function handler(request: Request): Promise<Response> {
	await connection();

	if (!bridgeConfigured()) {
		return failure(
			"The research agent is not configured for this install.",
			503,
		);
	}

	const route = eveProxyRoute(request);
	if (!route) return failure("Agent route not found.", 404);

	const session = await getSession();
	if (!session) return failure("Not signed in.", 401);

	let record: RecordContext;
	let builderConversation = false;
	if (route.kind === "create") {
		const requested = recordFromHeaders(request.headers);
		if (!requested) return failure("Name one CRM record.", 400);
		record = requested;
	} else {
		const conversation = await db.agentConversation.findUnique({
			where: { sessionId: route.sessionId },
			select: {
				id: true,
				kind: true,
				userId: true,
				contactId: true,
				companyId: true,
				dealId: true,
			},
		});
		const builderId = request.headers.get("x-crm-builder-conversation");
		if (
			!conversation ||
			conversation.userId !== session.user.id ||
			(conversation.kind === "BUILDER" && builderId !== conversation.id) ||
			(conversation.kind !== "BUILDER" && builderId !== null)
		) {
			return failure("Conversation not found.", 404);
		}
		builderConversation = conversation.kind === "BUILDER";
		record = {
			contactId: conversation.contactId ?? undefined,
			companyId: conversation.companyId ?? undefined,
			dealId: conversation.dealId ?? undefined,
		};
	}

	const authorization = `Bearer ${await mintBridgeToken(
		{
			id: session.user.id,
			email: session.user.email,
			name: session.user.name,
		},
		record,
	)}`;

	let body: string | null = null;
	if (route.kind !== "stream") {
		try {
			body = await eveProxyBody(request, route.kind);
		} catch (error) {
			if (error instanceof EveProxyRequestError) {
				return failure(error.message, error.status);
			}
			throw error;
		}
	}
	if (
		builderConversation &&
		route.kind === "send" &&
		!eveProxyBuilderSendAllowed(body)
	) {
		return failure("Builder messages must use the durable queue.", 409);
	}

	const target = eveProxyTargetUrl(request, AGENT_URL);
	const headers = new Headers({
		accept:
			route.kind === "stream" ? "application/x-ndjson" : "application/json",
		authorization,
	});
	if (body !== null) headers.set("content-type", "application/json");

	let upstream: Response;
	try {
		upstream = await fetch(target, {
			method: request.method,
			headers,
			body,
			redirect: "manual",
			signal: request.signal,
		});
	} catch {
		return failure("The research agent is not reachable.", 502);
	}

	if (!upstream.ok) {
		await upstream.body?.cancel();
		const status =
			upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
		return failure(
			"The research agent rejected the request.",
			status,
			upstream.headers,
		);
	}

	if (route.kind === "stream") {
		if (!upstream.body)
			return failure("The research agent returned no stream.", 502);
		return new Response(eveProxyStream(upstream.body), {
			status: upstream.status,
			headers: eveProxyResponseHeaders(upstream.headers),
		});
	}

	const upstreamSessionId = eveProxySessionId(
		upstream.headers.get("x-eve-session-id"),
	);
	let response: ReturnType<typeof eveProxyAgentResponse>;
	try {
		response = eveProxyAgentResponse(await upstream.json());
	} catch {
		if (route.kind === "create" && upstreamSessionId) {
			await cancelSession(upstreamSessionId, authorization);
		}
		return failure("The research agent returned an invalid response.", 502);
	}

	if (route.kind === "create") {
		const createdSessionId = response.sessionId ?? upstreamSessionId;
		if (!createdSessionId) {
			return failure("The research agent returned no session.", 502);
		}
		response = { ...response, sessionId: createdSessionId };
		try {
			await db.agentConversation.create({
				data: {
					kind: "RECORD",
					sessionId: createdSessionId,
					userId: session.user.id,
					title: eveProxyMessageTitle(body),
					...record,
				},
			});
		} catch {
			await cancelSession(createdSessionId, authorization);
			return failure("The conversation could not be saved.", 500);
		}
	}

	return Response.json(response, {
		status: upstream.status,
		headers: eveProxyResponseHeaders(upstream.headers),
	});
}

function recordFromHeaders(headers: Headers): RecordContext | null {
	const values = [
		["contactId", headers.get("x-crm-contact")],
		["companyId", headers.get("x-crm-company")],
		["dealId", headers.get("x-crm-deal")],
	] as const;
	const present = values.filter((entry) => entry[1] !== null);
	if (present.length !== 1) return null;
	const [key, value] = present[0] ?? [];
	const parsed = recordId.safeParse(value);
	return key && parsed.success ? { [key]: parsed.data } : null;
}

async function cancelSession(
	sessionId: string,
	authorization: string,
): Promise<void> {
	try {
		const target = new URL(
			`/eve/v1/session/${encodeURIComponent(sessionId)}/cancel`,
			AGENT_URL,
		);
		const response = await fetch(target, {
			method: "POST",
			headers: {
				accept: "application/json",
				authorization,
				"content-type": "application/json",
			},
			body: "{}",
			redirect: "manual",
		});
		await response.body?.cancel();
	} catch {
		return;
	}
}

function failure(
	error: string,
	status: number,
	upstreamHeaders?: Headers,
): Response {
	const headers = upstreamHeaders
		? eveProxyResponseHeaders(upstreamHeaders)
		: new Headers();
	headers.set("cache-control", "no-store");
	return Response.json({ error }, { status, headers });
}

export { handler as GET, handler as POST };
