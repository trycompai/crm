import type { AgentDefinitionStatus } from "@crm/db/enums";
import { parseAgentManifest } from "@crm/validation/agent-manifest";

type AgentUsingMcp = {
	id: string;
	name: string;
	description: string | null;
	status: "LIVE" | "PAUSED";
};

type AgentManifestRow = Omit<AgentUsingMcp, "status"> & {
	status: AgentDefinitionStatus;
	currentVersion: { manifest: unknown } | null;
};

export function agentsByMcpPlatform(rows: AgentManifestRow[]) {
	const byPlatform = new Map<string, AgentUsingMcp[]>();

	for (const row of rows) {
		if (
			!row.currentVersion ||
			(row.status !== "LIVE" && row.status !== "PAUSED")
		)
			continue;
		const manifest = parseAgentManifest(row.currentVersion.manifest);
		const agent = {
			id: row.id,
			name: row.name,
			description: row.description,
			status: row.status,
		};

		for (const grant of manifest.mcp) {
			const agents = byPlatform.get(grant.platformSlug) ?? [];
			agents.push(agent);
			byPlatform.set(grant.platformSlug, agents);
		}
	}

	return byPlatform;
}
