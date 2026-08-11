import type { NextRequest } from "next/server";
import { API_URL } from "@/lib/env";

export const ONBOARDING_PATH = "/onboarding";

export const RESEARCH_PATH = "/onboarding/research";

const GATE_TIMEOUT_MS = 2_000;

export type Gate = "settled" | "required" | "unknown";

async function read<T>(
	request: NextRequest,
	procedure: string,
): Promise<T | null> {
	const cookie = request.headers.get("cookie");

	if (!cookie) return null;

	try {
		const response = await fetch(`${API_URL}/api/trpc/${procedure}`, {
			headers: { cookie },
			cache: "no-store",
			signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
		});

		if (!response.ok) return null;

		const body = (await response.json()) as { result?: { data?: T } };

		return body.result?.data ?? null;
	} catch {
		return null;
	}
}

export type WorkspaceGate = { gate: Gate; slug: string | null };

export async function readWorkspaceGate(
	request: NextRequest,
): Promise<WorkspaceGate> {
	const workspace = await read<{
		onboarded?: boolean;
		canRename?: boolean;
		slug?: string;
	}>(request, "workspace.get");

	const slug = workspace?.slug ? workspace.slug : null;

	if (typeof workspace?.onboarded !== "boolean") {
		return { gate: "unknown", slug };
	}

	return {
		gate: workspace.onboarded || !workspace.canRename ? "settled" : "required",
		slug,
	};
}
