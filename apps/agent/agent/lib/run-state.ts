import type { Prisma } from "@crm/db";
import type { AgentRunStatus } from "@crm/db/enums";

export type LockedAgentRun = {
	id: string;
	agentId: string;
	versionId: string;
	status: AgentRunStatus;
	sessionId: string | null;
	startedAt: Date | null;
	nextEventSequence: number;
};

export async function lockAgentRun(
	tx: Prisma.TransactionClient,
	runId: string,
): Promise<LockedAgentRun> {
	const [run] = await tx.$queryRaw<LockedAgentRun[]>`
		SELECT id, "agentId", "versionId", status, "sessionId", "startedAt", "nextEventSequence"
		FROM "agentRun"
		WHERE id = ${runId}
		FOR UPDATE
	`;
	if (!run) throw new Error("This agent run is unavailable.");
	return run;
}

export function runTerminalEventId(
	runId: string,
	terminal: "completed" | "failed" | "cancelled",
) {
	return `run-terminal:${runId}:${terminal}`;
}

export const TERMINAL_RUN_STATUSES = [
	"SUCCEEDED",
	"FAILED",
	"CANCELLED",
] as const satisfies readonly AgentRunStatus[];

export function isTerminalRunStatus(
	status: AgentRunStatus,
): status is (typeof TERMINAL_RUN_STATUSES)[number] {
	return TERMINAL_RUN_STATUSES.includes(
		status as (typeof TERMINAL_RUN_STATUSES)[number],
	);
}
