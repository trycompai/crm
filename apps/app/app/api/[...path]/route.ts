import { connection } from "next/server";
import { bufferedProxyResponse } from "@/lib/api-proxy-response";
import { API_URL } from "@/lib/env";

async function handler(request: Request): Promise<Response> {
	await connection();

	const url = new URL(request.url);
	const target = `${API_URL}${url.pathname}${url.search}`;

	const headers = new Headers(request.headers);
	for (const header of [
		"host",
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

	const init: RequestInit & { duplex?: "half" } = {
		method: request.method,
		headers,
		redirect: "manual",
	};

	if (request.method !== "GET" && request.method !== "HEAD") {
		init.body = request.body;
		init.duplex = "half";
	}

	let upstream: Response;

	try {
		upstream = await fetch(target, init);
	} catch (error) {
		console.error(
			`API proxy: ${API_URL} is not reachable for ${request.method} ${url.pathname}.`,
			error,
		);

		return Response.json(
			{ error: `The API at ${API_URL} is not reachable.` },
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

	const setCookies = upstream.headers.getSetCookie?.() ?? [];
	if (setCookies.length > 0) {
		responseHeaders.delete("set-cookie");
		for (const cookie of setCookies) {
			responseHeaders.append("set-cookie", cookie);
		}
	}

	if (
		upstream.headers.get("content-type")?.includes("text/event-stream") ||
		upstream.headers.has("content-disposition")
	) {
		return new Response(upstream.body, {
			status: upstream.status,
			statusText: upstream.statusText,
			headers: responseHeaders,
		});
	}

	return bufferedProxyResponse(upstream, responseHeaders, request.method);
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
