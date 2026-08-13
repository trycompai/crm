import { db } from "@crm/db";
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
