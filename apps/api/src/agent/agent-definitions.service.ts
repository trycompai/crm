import type { Db, Prisma } from "@crm/db";
import type { AgentDefinitionStatus } from "@crm/db/enums";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { AgentAccessService } from "./agent-access.service";
import { TEAM_AGENT_STATUSES } from "./agent-visibility";
import type { AgentDeployInput, AgentUpdateInput } from "./agents.contracts";

@Injectable()
export class AgentDefinitionsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
	) {}

	async list(userId: string) {
		await this.access.assertMember(userId);

		const rows = await this.db.agentDefinition.findMany({
			where: { status: { in: [...TEAM_AGENT_STATUSES] } },
			orderBy: { updatedAt: "desc" },
			select: {
				id: true,
				name: true,
				description: true,
				status: true,
				createdAt: true,
				updatedAt: true,
				createdBy: { select: { id: true, name: true, image: true } },
				currentVersion: {
					select: { id: true, number: true, deployedAt: true },
				},
				triggers: {
					where: { enabled: true },
					orderBy: { nextRunAt: "asc" },
					take: 1,
					select: { id: true, type: true, name: true, nextRunAt: true },
				},
				_count: { select: { runs: true } },
			},
		});

		return rows.map((row) => ({
			...row,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
			currentVersion: row.currentVersion
				? {
						...row.currentVersion,
						deployedAt: row.currentVersion.deployedAt?.toISOString() ?? null,
					}
				: null,
			triggers: row.triggers.map((trigger) => ({
				...trigger,
				nextRunAt: trigger.nextRunAt?.toISOString() ?? null,
			})),
			runCount: row._count.runs,
		}));
	}

	async byId(id: string, userId: string) {
		await this.access.assertCanRead(id, userId);

		const row = await this.db.agentDefinition.findFirst({
			where: { id, status: { not: "DELETED" } },
			select: {
				id: true,
				name: true,
				description: true,
				status: true,
				createdById: true,
				createdAt: true,
				updatedAt: true,
				createdBy: { select: { id: true, name: true, image: true } },
				currentVersion: {
					select: {
						id: true,
						number: true,
						status: true,
						manifest: true,
						modelId: true,
						sandboxPolicy: true,
						approvedAt: true,
						deployedAt: true,
					},
				},
				versions: {
					where: { status: { in: ["DRAFT", "READY"] } },
					orderBy: { number: "desc" },
					take: 1,
					select: {
						id: true,
						number: true,
						status: true,
						manifest: true,
						modelId: true,
						sandboxPolicy: true,
						sourceConversationId: true,
					},
				},
				triggers: {
					orderBy: { createdAt: "asc" },
					select: {
						id: true,
						type: true,
						name: true,
						config: true,
						enabled: true,
						nextRunAt: true,
						lastRunAt: true,
					},
				},
				_count: { select: { runs: true } },
			},
		});

		if (!row) throw new NotFoundException(`No agent with id ${id}.`);
		const { versions, ...agent } = row;

		return {
			...agent,
			canManage: agent.createdById === userId || (await this.canAdmin(userId)),
			createdAt: agent.createdAt.toISOString(),
			updatedAt: agent.updatedAt.toISOString(),
			currentVersion: agent.currentVersion
				? {
						...agent.currentVersion,
						approvedAt: agent.currentVersion.approvedAt?.toISOString() ?? null,
						deployedAt: agent.currentVersion.deployedAt?.toISOString() ?? null,
					}
				: null,
			reviewVersion: agent.status === "DRAFT" ? (versions[0] ?? null) : null,
			triggers: agent.triggers.map((trigger) => ({
				...trigger,
				nextRunAt: trigger.nextRunAt?.toISOString() ?? null,
				lastRunAt: trigger.lastRunAt?.toISOString() ?? null,
			})),
			runCount: agent._count.runs,
		};
	}

	async update(input: AgentUpdateInput, userId: string) {
		const description = input.description?.trim() || null;

		const updated = await this.db.$transaction(async (tx) => {
			await this.access.assertCanManageInTransaction(tx, input.id, userId);
			const agent = await this.lockAgent(tx, input.id);
			const row = await tx.agentDefinition.update({
				where: { id: input.id },
				data: { name: input.name, description },
				select: { id: true, name: true, description: true, status: true },
			});

			await tx.agentAuditEvent.create({
				data: {
					agentId: input.id,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type: "agent.updated",
					summary: "Changed agent details",
					before: { name: agent.name, description: agent.description },
					after: { name: input.name, description },
				},
			});

			return row;
		});

		return updated;
	}

	async deploy(input: AgentDeployInput, userId: string) {
		return this.db.$transaction(async (tx) => {
			await this.access.assertCanManageInTransaction(tx, input.id, userId);
			const agent = await this.lockAgent(tx, input.id);
			const existing = await tx.agentAuditEvent.findFirst({
				where: {
					agentId: input.id,
					type: "agent.deployed",
					requestId: input.clientRequestId,
				},
				select: { versionId: true },
			});

			if (existing) {
				if (existing.versionId !== input.versionId) {
					throw new BadRequestException(
						"That deployment request has already been used.",
					);
				}

				return { id: input.id, versionId: input.versionId, status: "LIVE" };
			}

			const version = await tx.agentVersion.findFirst({
				where: { id: input.versionId, agentId: input.id },
				select: { id: true, number: true, status: true, manifest: true },
			});

			if (!version) {
				throw new NotFoundException(`No version with id ${input.versionId}.`);
			}

			if (version.status !== "READY" && version.status !== "DEPLOYED") {
				throw new BadRequestException(
					"Only a validated agent version can be deployed.",
				);
			}
			const metadata = versionMetadata(version.manifest);

			const now = new Date();
			await tx.agentVersion.updateMany({
				where: {
					agentId: input.id,
					status: "DEPLOYED",
					id: { not: input.versionId },
				},
				data: { status: "READY" },
			});

			await tx.agentVersion.update({
				where: { id: input.versionId },
				data: {
					status: "DEPLOYED",
					approvedAt: now,
					deployedAt: now,
				},
			});

			await tx.agentDefinition.update({
				where: { id: input.id },
				data: {
					currentVersionId: input.versionId,
					status: "LIVE",
					archivedAt: null,
					...metadata,
				},
			});

			await tx.agentTrigger.updateMany({
				where: { agentId: input.id },
				data: { enabled: false },
			});

			await tx.agentTrigger.updateMany({
				where: { agentId: input.id, versionId: input.versionId },
				data: { enabled: true },
			});

			await tx.agentAuditEvent.create({
				data: {
					agentId: input.id,
					versionId: input.versionId,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type: "agent.deployed",
					summary: `Made version ${version.number} live for the team`,
					before: { status: agent.status },
					after: { status: "LIVE", version: version.number, ...metadata },
					requestId: input.clientRequestId,
				},
			});

			return { id: input.id, versionId: input.versionId, status: "LIVE" };
		});
	}

	async pause(id: string, userId: string) {
		return this.changeStatus(
			id,
			userId,
			["LIVE"],
			"PAUSED",
			"agent.paused",
			"Paused agent",
			"Only a live agent can be paused.",
		);
	}

	async resume(id: string, userId: string) {
		return this.changeStatus(
			id,
			userId,
			["PAUSED"],
			"LIVE",
			"agent.resumed",
			"Resumed agent",
			"Only a paused agent can be resumed.",
		);
	}

	async archive(id: string, userId: string) {
		return this.changeStatus(
			id,
			userId,
			["LIVE", "PAUSED"],
			"ARCHIVED",
			"agent.archived",
			"Archived agent",
			"Only a live or paused agent can be archived.",
			{ archivedAt: new Date() },
		);
	}

	async restore(id: string, userId: string) {
		return this.changeStatus(
			id,
			userId,
			["ARCHIVED"],
			"PAUSED",
			"agent.restored",
			"Restored agent",
			"Only an archived agent can be restored.",
			{ archivedAt: null },
		);
	}

	async remove(id: string, userId: string) {
		const now = new Date();

		return this.db.$transaction(async (tx) => {
			await this.access.assertCanManageInTransaction(tx, id, userId);
			const [current] = await tx.$queryRaw<
				Array<{ id: string; status: string }>
			>`
				SELECT id, status
				FROM "agentDefinition"
				WHERE id = ${id}
				FOR UPDATE
			`;

			if (!current || current.status === "DELETED") {
				throw new NotFoundException(`No agent with id ${id}.`);
			}

			const disabledTriggers = await tx.agentTrigger.updateMany({
				where: { agentId: id, enabled: true },
				data: { enabled: false, nextRunAt: null },
			});

			const cancellableRuns = await tx.$queryRaw<Array<{ id: string }>>`
				SELECT id
				FROM "agentRun"
				WHERE "agentId" = ${id}
					AND (
						status IN ('QUEUED', 'WAITING_FOR_APPROVAL')
						OR (status = 'RUNNING' AND "sessionId" IS NULL)
					)
				ORDER BY id
				FOR UPDATE
			`;

			for (const run of cancellableRuns) {
				const cancelled = await tx.agentRun.update({
					where: { id: run.id },
					data: {
						status: "CANCELLED",
						finishedAt: now,
						errorCode: "AGENT_DELETED",
						errorMessage: "The agent was deleted before this run completed.",
						nextEventSequence: { increment: 1 },
					},
					select: { nextEventSequence: true },
				});

				await tx.agentRunEvent.create({
					data: {
						runId: run.id,
						sequence: cancelled.nextEventSequence,
						type: "run.cancelled",
						data: { reason: "agent.deleted" },
						emittedAt: now,
					},
				});
			}

			const agent = await tx.agentDefinition.update({
				where: { id },
				data: { status: "DELETED", deletedAt: now },
				select: { id: true, name: true, status: true, updatedAt: true },
			});

			await tx.agentAuditEvent.create({
				data: {
					agentId: id,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type: "agent.deleted",
					summary: "Deleted agent",
					before: { status: current.status },
					after: {
						status: "DELETED",
						disabledTriggers: disabledTriggers.count,
						cancelledRuns: cancellableRuns.length,
					},
				},
			});

			return {
				...agent,
				updatedAt: agent.updatedAt.toISOString(),
				disabledTriggers: disabledTriggers.count,
				cancelledRuns: cancellableRuns.length,
			};
		});
	}

	private async changeStatus(
		id: string,
		userId: string,
		allowedFrom: readonly AgentDefinitionStatus[],
		status: "LIVE" | "PAUSED" | "ARCHIVED",
		type: string,
		summary: string,
		invalidStatusMessage: string,
		extra: Prisma.AgentDefinitionUpdateInput = {},
	) {
		return this.db.$transaction(async (tx) => {
			await this.access.assertCanManageInTransaction(tx, id, userId);
			const before = await this.lockAgent(tx, id);
			if (!allowedFrom.includes(before.status)) {
				throw new BadRequestException(invalidStatusMessage);
			}

			const agent = await tx.agentDefinition.update({
				where: { id },
				data: { status, ...extra },
				select: { id: true, name: true, status: true, updatedAt: true },
			});

			await tx.agentAuditEvent.create({
				data: {
					agentId: id,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type,
					summary,
					before: { status: before.status },
					after: { status },
				},
			});

			return { ...agent, updatedAt: agent.updatedAt.toISOString() };
		});
	}

	private async lockAgent(tx: Prisma.TransactionClient, id: string) {
		const [agent] = await tx.$queryRaw<
			Array<{
				id: string;
				status: AgentDefinitionStatus;
				name: string;
				description: string | null;
			}>
		>`
			SELECT id, status, name, description
			FROM "agentDefinition"
			WHERE id = ${id}
			FOR UPDATE
		`;

		if (!agent || agent.status === "DELETED") {
			throw new NotFoundException(`No agent with id ${id}.`);
		}

		return agent;
	}

	private async canAdmin(userId: string): Promise<boolean> {
		const role = await this.access.assertMember(userId);
		return role === "owner" || role === "admin";
	}
}

function versionMetadata(manifest: unknown): {
	name?: string;
	description?: string | null;
} {
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
		return {};
	}

	const record = manifest as Record<string, unknown>;
	const name = typeof record.name === "string" ? record.name.trim() : "";
	const description =
		typeof record.description === "string"
			? record.description.trim() || null
			: undefined;

	return {
		...(name ? { name } : {}),
		...(description !== undefined ? { description } : {}),
	};
}
