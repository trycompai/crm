import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

export async function bufferedProxyResponse(
	upstream: Response,
	headers: Headers,
	method: string,
): Promise<Response> {
	const responseHeaders = new Headers(headers);
	responseHeaders.delete("content-encoding");
	responseHeaders.delete("content-length");
	const init: ResponseInit = {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: responseHeaders,
	};
	if (!responseCanHaveBody(method, upstream.status)) {
		return new Response(null, init);
	}

	const raw = Buffer.from(await upstream.arrayBuffer());
	const body = decode(raw, upstream.headers.get("content-encoding"));
	return new Response(new Uint8Array(body), init);
}

export function responseCanHaveBody(method: string, status: number): boolean {
	return method !== "HEAD" && ![204, 205, 304].includes(status);
}

function decode(buf: Buffer, encoding: string | null): Buffer {
	const enc = (encoding ?? "").toLowerCase();
	try {
		if (enc.includes("br")) return brotliDecompressSync(buf);
		if (enc.includes("gzip")) return gunzipSync(buf);
		if (enc.includes("deflate")) return inflateSync(buf);
	} catch {}
	return buf;
}
