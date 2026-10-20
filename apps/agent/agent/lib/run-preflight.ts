import { db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	type AgentManifest,
	InvalidAgentManifest,
	parseAgentManifest,
} from "@crm/validation/agent-manifest";
import {
	type AgentActionDependencyId,
	actionDependency,
} from "./agent-actions";
import { slackConnected } from "./slack-connection";

export const DEPENDENCY_UNAVAILABLE = "DEPENDENCY_UNAVAILABLE";

const CHECKS = {
	slack: slackConnected,
} satisfies Record<AgentActionDependencyId, () => Promise<boolean>>;

export async function missingRunDependencies(
	manifest: AgentManifest,
): Promise<string[]> {
	const required = new Map<AgentActionDependencyId, string>();

	for (const action of manifest.actions) {
		const dependency = actionDependency(action.type);
		if (dependency) required.set(dependency.id, dependency.fix);
	}

	const missing: string[] = [];
	for (const [id, fix] of required) {
		if (!(await CHECKS[id]())) missing.push(fix);
	}
	for (const grant of manifest.mcp) {
		const connection = await db.mcpConnection.findUnique({
			where: {
				organizationId_platformSlug: {
					organizationId: WORKSPACE_ID,
					platformSlug: grant.platformSlug,
				},
			},
			select: {
				status: true,
				accessMode: true,
				toolSnapshots: {
					where: {
						OR: grant.tools.map((tool) => ({
							name: tool.name,
							fingerprint: tool.fingerprint,
							reviewState: "REVIEWED" as const,
						})),
					},
					select: { name: true, fingerprint: true },
				},
			},
		});
		const current = new Set(
			connection?.toolSnapshots.map(
				(tool) => `${tool.name}:${tool.fingerprint}`,
			) ?? [],
		);
		const unavailable =
			connection?.status !== "CONNECTED" ||
			grant.tools.some(
				(tool) =>
					!current.has(`${tool.name}:${tool.fingerprint}`) ||
					(connection.accessMode === "READ_ONLY" && tool.callKind !== "read"),
			);
		if (unavailable) {
			missing.push(
				`Reconnect ${grant.platformSlug} and review its tools in Settings → Connections.`,
			);
		}
	}

	return missing;
}

export async function runDependencyFailure(
	versionId: string,
): Promise<string | null> {
	const version = await db.agentVersion.findUnique({
		where: { id: versionId },
		select: { manifest: true },
	});
	if (!version) return null;

	let manifest: AgentManifest;
	try {
		manifest = parseAgentManifest(version.manifest);
	} catch (error) {
		return error instanceof InvalidAgentManifest ? error.message : null;
	}

	const missing = await missingRunDependencies(manifest);
	if (missing.length === 0) return null;

	return `This agent cannot run yet. ${missing.join(" ")}`;
}
