import { db } from "@crm/db";
import { connection } from "next/server";
import {
	AGENT_URL,
	bridgeConfigured,
	mintBridgeToken,
} from "@/lib/agent-bridge";
import { GRAPH_NODE_ID } from "@/lib/campaign-graph";
import { getSession } from "@/lib/session";

const RECORD_ID = /^[a-z0-9]{20,32}$/;

async function handler(request: Request): Promise<Response> {
	await connection();

	if (!bridgeConfigured()) {
		return Response.json(
			{ error: "The research agent is not configured for this install." },
			{ status: 503 },
		);
	}

	const session = await getSession();
	if (!session) {
		return Response.json({ error: "Not signed in." }, { status: 401 });
	}

	const url = new URL(request.url);
	const target = `${AGENT_URL}${url.pathname}${url.search}`;

	const headers = new Headers(request.headers);

	for (const header of [
		"host",
		"cookie",
		"x-forwarded-host",
		"x-forwarded-proto",
		"x-forwarded-for",
		"forwarded",
		"transfer-encoding",
		"connection",
		"keep-alive",
		"content-length",
		"expect",
	]) {
		headers.delete(header);
	}

	const contactId = request.headers.get("x-crm-contact");
	const companyId = request.headers.get("x-crm-company");
	const dealId = request.headers.get("x-crm-deal");
	const campaignId = request.headers.get("x-crm-campaign");
	const campaignNodeId = request.headers.get("x-crm-campaign-node");
	const segmentId = request.headers.get("x-crm-segment");
	const templateId = request.headers.get("x-crm-template");
	const shellId = request.headers.get("x-crm-shell");
	const builderConversationId = request.headers.get(
		"x-crm-builder-conversation",
	);
	const requestedSession = sessionFromPath(url.pathname);
	headers.delete("x-crm-contact");
	headers.delete("x-crm-company");
	headers.delete("x-crm-deal");
	headers.delete("x-crm-campaign");
	headers.delete("x-crm-campaign-node");
	headers.delete("x-crm-segment");
	headers.delete("x-crm-template");
	headers.delete("x-crm-shell");
	headers.delete("x-crm-builder-conversation");

	if (requestedSession) {
		const conversation = await db.agentConversation.findUnique({
			where: { sessionId: requestedSession },
			select: { userId: true },
		});
		if (conversation && conversation.userId !== session.user.id) {
			return Response.json(
				{ error: "Conversation not found." },
				{ status: 404 },
			);
		}
	}

	if (builderConversationId) {
		const conversation = await db.agentConversation.findFirst({
			where: {
				id: builderConversationId,
				userId: session.user.id,
				kind: "BUILDER",
			},
			select: { sessionId: true },
		});
		if (
			!conversation ||
			(requestedSession && conversation.sessionId !== requestedSession)
		) {
			return Response.json(
				{ error: "Conversation not found." },
				{ status: 404 },
			);
		}
	}

	const campaign = recordId(campaignId);

	headers.set(
		"authorization",
		`Bearer ${await mintBridgeToken(
			{
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
			},
			{
				contactId: recordId(contactId),
				companyId: recordId(companyId),
				dealId: recordId(dealId),
				campaignId: campaign,
				campaignNodeId: campaign ? nodeId(campaignNodeId) : undefined,
				segmentId: recordId(segmentId),
				templateId: recordId(templateId),
				shellId: recordId(shellId),
			},
		)}`,
	);

	const init: RequestInit & { duplex?: "half" } = {
		method: request.method,
		headers,
		redirect: "manual",
		signal: request.signal,
	};

	if (request.method !== "GET" && request.method !== "HEAD") {
		init.body = request.body;
		init.duplex = "half";
	}

	let upstream: Response;
	try {
		upstream = await fetch(target, init);
	} catch (error) {
		return Response.json(
			{
				error: "The research agent is not reachable.",
				detail: error instanceof Error ? error.message : String(error),
			},
			{ status: 502 },
		);
	}

	const responseHeaders = new Headers(upstream.headers);
	for (const header of [
		"transfer-encoding",
		"connection",
		"content-encoding",
		"content-length",
	]) {
		responseHeaders.delete(header);
	}

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: responseHeaders,
	});
}

export {
	handler as DELETE,
	handler as GET,
	handler as HEAD,
	handler as OPTIONS,
	handler as PATCH,
	handler as POST,
	handler as PUT,
};

function recordId(value: string | null): string | undefined {
	return value && RECORD_ID.test(value) ? value : undefined;
}

function nodeId(value: string | null): string | undefined {
	if (!value) return undefined;
	return RECORD_ID.test(value) || GRAPH_NODE_ID.test(value) ? value : undefined;
}

function sessionFromPath(pathname: string): string | null {
	const match = pathname.match(/\/eve\/v1\/session\/([^/]+)/);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}
