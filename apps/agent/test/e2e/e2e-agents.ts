import { db } from "@crm/db";

export async function removeAgent(agentId: string): Promise<void> {
	await db.agentRunEvent.deleteMany({ where: { run: { agentId } } });
	await db.agentAction.deleteMany({ where: { agentId } });
	await db.agentAuditEvent.deleteMany({ where: { agentId } });
	await db.agentRun.deleteMany({ where: { agentId } });
	await db.agentTrigger.deleteMany({ where: { agentId } });
	await db.agentDefinition.update({
		where: { id: agentId },
		data: { currentVersionId: null },
	});
	await db.agentVersion.deleteMany({ where: { agentId } });
	await db.agentDefinition.delete({ where: { id: agentId } });
}

export async function removeAgentsNamed(prefix: string): Promise<string[]> {
	const stale = await db.agentDefinition.findMany({
		where: { name: { startsWith: prefix } },
		select: { id: true, name: true },
	});

	for (const agent of stale) await removeAgent(agent.id);

	return stale.map((agent) => agent.name);
}

export async function removeEventRuns(
	taskIds: readonly string[],
): Promise<number> {
	if (taskIds.length === 0) return 0;

	const runs = await db.agentRun.findMany({
		where: {
			OR: taskIds.map((taskId) => ({
				idempotencyKey: { startsWith: `event:${taskId}:` },
			})),
		},
		select: { id: true },
	});
	const runIds = runs.map((run) => run.id);
	if (runIds.length === 0) return 0;

	await db.agentRunEvent.deleteMany({ where: { runId: { in: runIds } } });
	await db.agentAction.deleteMany({ where: { runId: { in: runIds } } });
	await db.agentAuditEvent.deleteMany({ where: { requestId: { in: runIds } } });
	await db.agentRun.deleteMany({ where: { id: { in: runIds } } });

	return runIds.length;
}

export function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
