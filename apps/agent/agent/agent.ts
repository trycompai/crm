import "@crm/env/load";

import { DEFAULT_AGENT_MODEL } from "@crm/db/settings";
import { onTelemetryProblem, syncVersion } from "@crm/telemetry";
import {
	type AgentDefinition,
	type AgentModelDefinition,
	defineAgent,
	defineDynamic,
} from "eve";
import { logCapabilities } from "./lib/capabilities";
import { selectedModel } from "./lib/model";

void logCapabilities();

onTelemetryProblem((message) => console.debug(`[telemetry] ${message}`));

void syncVersion();

const reasoning = [
	"provider-default",
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
].includes(process.env.LODE_AGENT_REASONING ?? "")
	? (process.env.LODE_AGENT_REASONING as
			| "provider-default"
			| "none"
			| "minimal"
			| "low"
			| "medium"
			| "high"
			| "xhigh")
	: "provider-default";

const model: AgentModelDefinition = defineDynamic({
	fallback: DEFAULT_AGENT_MODEL.id,
	events: { "session.started": () => selectedModel() },
});

export default defineAgent<AgentDefinition>({
	model,
	reasoning,
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 50_000,
		sessionTimeoutMs: 30 * 24 * 60 * 60 * 1000,
	},
}) as AgentDefinition;
