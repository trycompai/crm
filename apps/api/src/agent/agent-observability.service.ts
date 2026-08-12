import type { Db } from "@crm/db";
import { readLifecycleRole } from "@crm/validation";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { AgentAccessService } from "./agent-access.service";
import { TEAM_AGENT_STATUSES } from "./agent-visibility";

const WINDOW_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const DEPENDENCY_UNAVAILABLE = "DEPENDENCY_UNAVAILABLE";

@Injectable()
export class AgentObservabilityService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
	) {}

	async fleet(userId: string) {
		await this.access.assertMember(userId);

		const since = new Date(Date.now() - WINDOW_HOURS * HOUR_MS);

		const [
			statusRows,
			triggerRows,
			openRuns,
			runs,
			actionTypeRows,
			actionStatusRows,
			agents,
		] = await Promise.all([
			this.db.agentRun.groupBy({
				by: ["status"],
				where: { createdAt: { gte: since } },
				_count: { _all: true },
			}),
			this.db.agentRun.groupBy({
				by: ["triggerType"],
				where: { createdAt: { gte: since } },
				_count: { _all: true },
			}),
			this.db.agentRun.groupBy({
				by: ["status"],
				where: {
					status: { in: ["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"] },
				},
				_count: { _all: true },
			}),
			this.db.agentRun.findMany({
				where: { createdAt: { gte: since } },
				select: {
					status: true,
					cancelRequestedAt: true,
					errorCode: true,
					inputTokens: true,
					outputTokens: true,
					costUsd: true,
					sessionId: true,
					version: { select: { manifest: true } },
					_count: { select: { actions: true, events: true } },
				},
			}),
			this.db.agentAction.groupBy({
				by: ["type"],
				where: { plannedAt: { gte: since } },
				_count: { _all: true },
			}),
			this.db.agentAction.groupBy({
				by: ["status"],
				where: { plannedAt: { gte: since } },
				_count: { _all: true },
			}),
			this.db.agentDefinition.findMany({
				where: { status: { in: [...TEAM_AGENT_STATUSES] } },
				select: {
					id: true,
					name: true,
					status: true,
					currentVersion: { select: { manifest: true } },
					versions: {
						where: { status: { in: ["DRAFT", "READY"] } },
						orderBy: { number: "desc" },
						take: 1,
						select: { manifest: true },
					},
					_count: { select: { runs: true } },
				},
			}),
		]);

		const runsByRole: Record<string, number> = {};
		let cancelled = 0;
		let cancelAfterAction = 0;
		let dependencyFailures = 0;
		let inputTokens = 0;
		let outputTokens = 0;
		let costUsd = 0;
		let sessionsWithTrace = 0;
		let toolEvents = 0;

		for (const run of runs) {
			const role = readLifecycleRole(run.version.manifest);
			const roleKey = role ?? "none";
			runsByRole[roleKey] = (runsByRole[roleKey] ?? 0) + 1;

			if (run.status === "CANCELLED" || run.cancelRequestedAt) {
				cancelled += 1;
				if (run._count.actions > 0) cancelAfterAction += 1;
			}

			if (run.errorCode === DEPENDENCY_UNAVAILABLE) {
				dependencyFailures += 1;
			}

			inputTokens += run.inputTokens ?? 0;
			outputTokens += run.outputTokens ?? 0;
			costUsd += Number(run.costUsd ?? 0);
			if (run.sessionId) sessionsWithTrace += 1;
			toolEvents += run._count.events;
		}

		const agentsByRole: Record<string, number> = {};
		for (const agent of agents) {
			const manifest =
				agent.currentVersion?.manifest ?? agent.versions[0]?.manifest;
			const role = readLifecycleRole(manifest) ?? "none";
			agentsByRole[role] = (agentsByRole[role] ?? 0) + 1;
		}

		return {
			windowHours: WINDOW_HOURS,
			since: since.toISOString(),
			runsByStatus: counts(statusRows.map((row) => [row.status, row._count._all])),
			runsByTrigger: counts(
				triggerRows.map((row) => [row.triggerType, row._count._all]),
			),
			runsByLifecycleRole: runsByRole,
			openRunsByStatus: counts(
				openRuns.map((row) => [row.status, row._count._all]),
			),
			actionsByType: counts(
				actionTypeRows.map((row) => [row.type, row._count._all]),
			),
			actionsByStatus: counts(
				actionStatusRows.map((row) => [row.status, row._count._all]),
			),
			quality: {
				cancelled,
				cancelAfterAction,
				dependencyFailures,
				failed: runsByRoleCount(statusRows, "FAILED"),
				succeeded: runsByRoleCount(statusRows, "SUCCEEDED"),
			},
			consumption: {
				inputTokens,
				outputTokens,
				costUsd: round(costUsd),
				runs: runs.length,
				sessionsWithTrace,
				runEvents: toolEvents,
			},
			agents: {
				total: agents.length,
				byStatus: counts(agents.map((agent) => [agent.status, 1])),
				byLifecycleRole: agentsByRole,
			},
		};
	}
}

function counts(entries: Array<[string, number]>): Record<string, number> {
	const result: Record<string, number> = {};
	for (const [key, count] of entries) {
		result[key] = (result[key] ?? 0) + count;
	}
	return result;
}

function runsByRoleCount(
	rows: Array<{ status: string; _count: { _all: number } }>,
	status: string,
): number {
	return rows.find((row) => row.status === status)?._count._all ?? 0;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
