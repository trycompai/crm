import type { NextRequest } from "next/server";
import { z } from "zod";
import { API_URL } from "@/lib/env";

export const ONBOARDING_PATH = "/onboarding";

export const RESEARCH_PATH = "/onboarding/research";

const GATE_TIMEOUT_MS = 2_000;

export type Gate = "settled" | "required" | "unknown";

const procedureResult = z
	.object({ result: z.object({ data: z.json() }).catch({ data: null }) })
	.catch({ result: { data: null } });

const workspaceAnswer = z
	.object({
		onboarded: z.boolean().nullable().catch(null),
		canRename: z.boolean().nullable().catch(null),
		slug: z.string().min(1).nullable().catch(null),
	})
	.catch({ onboarded: null, canRename: null, slug: null });

const researchKeyAnswer = z
	.object({ configured: z.boolean().nullable().catch(null) })
	.catch({ configured: null });

async function read(request: NextRequest, procedure: string) {
	const cookie = request.headers.get("cookie");

	if (!cookie) return null;

	try {
		const response = await fetch(`${API_URL}/api/trpc/${procedure}`, {
			headers: { cookie },
			cache: "no-store",
			signal: AbortSignal.timeout(GATE_TIMEOUT_MS),
		});

		if (!response.ok) return null;

		return procedureResult.parse(await response.json()).result.data;
	} catch {
		return null;
	}
}

export type WorkspaceGate = { gate: Gate; slug: string | null };

export async function readWorkspaceGate(
	request: NextRequest,
): Promise<WorkspaceGate> {
	const workspace = workspaceAnswer.parse(await read(request, "workspace.get"));

	const slug = workspace.slug;

	if (workspace.onboarded === null) {
		return { gate: "unknown", slug };
	}

	return {
		gate:
			workspace.onboarded || workspace.canRename !== true
				? "settled"
				: "required",
		slug,
	};
}

export async function readResearchGate(request: NextRequest): Promise<Gate> {
	const { configured } = researchKeyAnswer.parse(
		await read(request, "settings.researchKey"),
	);

	if (configured === null) return "unknown";

	return configured ? "settled" : "required";
}
