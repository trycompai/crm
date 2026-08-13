import { db } from "@crm/db";
import { readAgentModel } from "@crm/db/settings";
import { agentError, modelError } from "@crm/telemetry";
import { defineHook } from "eve/hooks";
import { z } from "zod";

type SessionPrincipal = {
	readonly attributes?: Readonly<Record<string, string | readonly string[]>>;
} | null;

const attributeText = z.string().trim().min(1).nullable().catch(null);

let modelId: string | null = null;

async function configuredModel(): Promise<string | null> {
	if (modelId) return modelId;

	try {
		modelId = (await readAgentModel(db)).id;
	} catch {
		modelId = null;
	}

	return modelId;
}

const MODEL_CODES = [
	"model",
	"gateway",
	"provider",
	"rate_limit",
	"context_length",
	"overloaded",
	"unauthorized",
];

function taskKind(auth: SessionPrincipal): string | null {
	return attributeText.parse(auth?.attributes?.taskKind);
}

function looksLikeModel(code: string): boolean {
	const lowered = code.toLowerCase();
	return MODEL_CODES.some((marker) => lowered.includes(marker));
}

export default defineHook({
	events: {
		"action.result"(event, ctx) {
			const { error, result, status } = event.data;
			if (status === "completed") return;

			agentError({
				error: error ?? status,
				tool: "toolName" in result ? result.toolName : null,
				taskKind: taskKind(ctx.session.auth.current ?? null),
				source: "tool",
			});
		},

		"turn.failed"(event, ctx) {
			agentError({
				error: event.data.code,
				taskKind: taskKind(ctx.session.auth.current ?? null),
				source: "turn",
			});
		},

		"session.failed"(event, ctx) {
			agentError({
				error: event.data.code,
				taskKind: taskKind(ctx.session.auth.current ?? null),
				source: "session",
			});
		},

		async "step.failed"(event) {
			if (!looksLikeModel(event.data.code)) return;

			modelError({
				error: event.data.code,
				modelId: await configuredModel(),
			});
		},
	},
});
