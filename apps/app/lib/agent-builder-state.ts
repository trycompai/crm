export type BuilderArtifactState = {
	id: string;
	versionId: string | null;
	path: string;
	revision: number;
	status: "WRITING" | "READY";
};

type BuilderVersionState = {
	id: string;
	status: string;
};

type BuilderAgentState = {
	status: string;
	currentVersion: { id: string } | null;
};

export type BuilderConversationState = {
	sessionId: string | null;
	continuationToken: string | null;
	submissions: Array<{ status: string }>;
	createdVersions: BuilderVersionState[];
	agent: BuilderAgentState | null;
};

export function completedBuilderSteps(
	artifacts: ReadonlyArray<{ path: string; createdAt: string }>,
	startedAt: string | null,
	sessionId: string | null,
): number {
	const paths = new Set<string>();
	for (const artifact of artifacts) {
		if (!startedAt || artifact.createdAt >= startedAt) {
			paths.add(artifact.path);
		}
	}
	if (paths.has("agent/README.md")) return 4;
	if (paths.has("agent/manifest.json")) return 3;
	if (paths.has("agent/instructions.md")) return 2;
	return sessionId ? 1 : 0;
}

export function builderConversationIsWorking(
	conversation: BuilderConversationState,
): boolean {
	return (
		conversation.submissions.some((submission) =>
			["PENDING", "SENDING"].includes(submission.status),
		) || Boolean(conversation.sessionId && !conversation.continuationToken)
	);
}

export function reviewVersionId(
	conversation: BuilderConversationState,
): string | null {
	const version = conversation.createdVersions[0];
	if (version?.status !== "READY") return null;
	if (version.id === conversation.agent?.currentVersion?.id) return null;
	return version.id;
}

export function displayedArtifactVersionId(
	conversation: BuilderConversationState,
	working: boolean,
): string | null {
	if (working) return null;
	return (
		reviewVersionId(conversation) ??
		conversation.agent?.currentVersion?.id ??
		conversation.createdVersions[0]?.id ??
		null
	);
}

export function latestBuilderArtifacts<T extends BuilderArtifactState>(
	artifacts: readonly T[],
	versionId: string | null,
): Map<string, T> {
	const candidates = versionId
		? artifacts.filter((artifact) => artifact.versionId === versionId)
		: artifacts;
	const latest = new Map<string, T>();
	for (const artifact of candidates) {
		const current = latest.get(artifact.path);
		if (!current || artifact.revision > current.revision) {
			latest.set(artifact.path, artifact);
		}
	}
	return latest;
}

export function latestCompletedArtifactVersionId(
	artifacts: readonly BuilderArtifactState[],
): string | null {
	return (
		artifacts.find(
			(artifact) => artifact.status === "READY" && artifact.versionId,
		)?.versionId ?? null
	);
}
