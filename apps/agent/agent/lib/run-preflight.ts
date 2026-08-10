import { db } from "@crm/db";
import { actionDependency } from "./agent-actions";
import {
	type AgentManifest,
	InvalidAgentManifest,
	parseAgentManifest,
} from "./agent-manifest";
import { slackConnected } from "./slack-connection";

export const DEPENDENCY_UNAVAILABLE = "DEPENDENCY_UNAVAILABLE";

const CHECKS: Record<string, () => Promise<boolean>> = {
	slack: slackConnected,
};

export async function missingRunDependencies(
	manifest: AgentManifest,
): Promise<string[]> {
	const required = new Map<string, string>();

	for (const action of manifest.actions) {
		const dependency = actionDependency(action.type);
		if (dependency) required.set(dependency.id, dependency.fix);
	}

	const missing: string[] = [];
	for (const [id, fix] of required) {
		const check = CHECKS[id];
		if (check && !(await check())) missing.push(fix);
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
