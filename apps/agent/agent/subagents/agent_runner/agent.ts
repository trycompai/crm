import { db } from "@crm/db";
import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";
import { defineAgent, defineDynamic } from "eve";
import { attribute, purposeOf } from "../../lib/session-purpose";

export default defineAgent({
	description:
		"Execute one immutable deployed CRM agent version and persist its result and every side effect.",
	model: defineDynamic({
		events: {
			"session.started": async (_event, ctx) => {
				if (purposeOf(ctx) !== "team-agent") {
					return {
						model: DEFAULT_AGENT_MODEL.id,
						modelContextWindowTokens: DEFAULT_AGENT_MODEL.contextWindowTokens,
					};
				}
				const runId = attribute(ctx, "runId");
				if (!runId) {
					return {
						model: DEFAULT_AGENT_MODEL.id,
						modelContextWindowTokens: DEFAULT_AGENT_MODEL.contextWindowTokens,
					};
				}

				const run = await db.agentRun.findUnique({
					where: { id: runId },
					select: {
						version: {
							select: { modelId: true, modelContextWindowTokens: true },
						},
					},
				});
				return run
					? {
							model: run.version.modelId,
							modelContextWindowTokens: run.version.modelContextWindowTokens,
						}
					: {
							model: DEFAULT_AGENT_MODEL.id,
							modelContextWindowTokens: DEFAULT_AGENT_MODEL.contextWindowTokens,
						};
			},
		},
	}),
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 40_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});
