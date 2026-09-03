import { connection } from "next/server";
import { edgarConfigured, edgarHeaders, edgarTarget } from "@/lib/edgar";
import { getSession } from "@/lib/session";

const TIMEOUT_MS = 60_000;

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
	await connection();

	if (!edgarConfigured()) {
		return Response.json(
			{ reason: "The SEC EDGAR service is not configured for this install." },
			{ status: 503 },
		);
	}

	const session = await getSession();
	if (!session) {
		return Response.json({ reason: "Not signed in." }, { status: 401 });
	}

	const { path } = await params;
	const url = new URL(request.url);
	const target = edgarTarget(path.join("/"), url.search);
	if (!target) {
		return Response.json({ reason: "No such route." }, { status: 404 });
	}

	try {
		const upstream = await fetch(target, {
			headers: edgarHeaders(),
			signal: AbortSignal.timeout(TIMEOUT_MS),
			cache: "no-store",
		});
		const body = await upstream.text();
		return new Response(body, {
			status: upstream.status,
			headers: { "content-type": "application/json" },
		});
	} catch (error) {
		return Response.json(
			{
				reason:
					error instanceof Error && error.name === "TimeoutError"
						? "The SEC EDGAR service did not answer in time."
						: "The SEC EDGAR service is unreachable.",
			},
			{ status: 502 },
		);
	}
}
