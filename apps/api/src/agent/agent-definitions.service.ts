import type { Db, Prisma } from "@crm/db";
import type { AgentDefinitionStatus } from "@crm/db/enums";
import { schemas } from "@crm/validation";
import { readAgentManifestSummary } from "@crm/validation/agent-manifest";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";
import { AgentAccessService } from "./agent-access.service";
import { AgentTriggerService } from "./agent-trigger.service";
import { TEAM_AGENT_STATUSES } from "./agent-visibility";
import {
	type AgentDeployInput,
	type AgentReviseInput,
	type AgentSaveFileInput,
	type AgentUpdateInput,
	agentManifest,
} from "./agents.contracts";

const INSTRUCTIONS_PATH = "agent/instructions.md";

type VersionMetadata = {
	name?: string;
	description?: string | null;
};

const capabilityName = z.string().nullable().catch(null);

const versionValidation = z
	.object({ capabilities: z.array(z.json()).catch([]) })
	.catchall(z.json())
	.catch({ capabilities: [] });

@Injectable()
export class AgentDefinitionsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly access: AgentAccessService,
		private readonly trigger: AgentTriggerService,
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
		const draft = versions[0];

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
			reviewVersion:
				agent.status === "DRAFT" && draft
					? { ...draft, manifest: readAgentManifestSummary(draft.manifest) }
					: null,
			triggers: agent.triggers.map((trigger) => ({
				...trigger,
				nextRunAt: trigger.nextRunAt?.toISOString() ?? null,
				lastRunAt: trigger.lastRunAt?.toISOString() ?? null,
			})),
			runCount: agent._count.runs,
			capabilities: readCapabilities(
				agent.currentVersion?.manifest ?? draft?.manifest,
			),
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

	async files(id: string, userId: string) {
		await this.access.assertCanRead(id, userId);

		const agent = await this.db.agentDefinition.findFirst({
			where: { id, status: { not: "DELETED" } },
			select: { currentVersionId: true },
		});
		if (!agent?.currentVersionId) return { versionId: null, files: [] };

		const rows = await this.db.agentBuilderArtifact.findMany({
			where: { versionId: agent.currentVersionId },
			orderBy: [{ path: "asc" }, { revision: "desc" }],
			select: {
				path: true,
				language: true,
				content: true,
				previousContent: true,
				revision: true,
			},
		});

		const latest = new Map<string, (typeof rows)[number]>();
		for (const row of rows)
			if (!latest.has(row.path)) latest.set(row.path, row);

		return {
			versionId: agent.currentVersionId,
			files: [...latest.values()],
		};
	}

	async saveFile(input: AgentSaveFileInput, userId: string) {
		return this.db.$transaction(async (tx) => {
			await this.access.assertCanManageInTransaction(tx, input.id, userId);
			const agent = await this.lockAgent(tx, input.id);

			const replay = await tx.agentAuditEvent.findFirst({
				where: {
					agentId: input.id,
					type: "agent.file.saved",
					requestId: input.clientRequestId,
				},
				select: { versionId: true },
			});
			if (replay) return { saved: false, versionId: replay.versionId };

			if (!agent.currentVersionId) {
				throw new BadRequestException("This agent has no deployed version.");
			}

			const current = await tx.agentVersion.findFirstOrThrow({
				where: { id: agent.currentVersionId },
				select: {
					status: true,
					instructions: true,
					manifest: true,
					modelId: true,
					modelContextWindowTokens: true,
					sandboxPolicy: true,
					validation: true,
					sourceConversationId: true,
					deployedAt: true,
					approvedAt: true,
				},
			});

			const file = await tx.agentBuilderArtifact.findFirst({
				where: { versionId: agent.currentVersionId, path: input.path },
				orderBy: { revision: "desc" },
			});
			if (!file) throw new NotFoundException(`No file at ${input.path}.`);
			if (file.content === input.content) {
				return { saved: false, versionId: agent.currentVersionId };
			}

			const version = await tx.agentVersion.create({
				data: {
					agentId: input.id,
					number: await nextVersionNumber(tx, input.id),
					status: current.status,
					instructions:
						input.path === INSTRUCTIONS_PATH
							? input.content
							: current.instructions,
					manifest: current.manifest as Prisma.InputJsonValue,
					modelId: current.modelId,
					modelContextWindowTokens: current.modelContextWindowTokens,
					sandboxPolicy: current.sandboxPolicy as Prisma.InputJsonValue,
					validation: current.validation as Prisma.InputJsonValue,
					sourceConversationId: current.sourceConversationId,
					approvedAt: current.approvedAt,
					deployedAt: current.deployedAt,
					createdById: userId,
				},
				select: { id: true },
			});

			await carryArtifactsForward(tx, agent.currentVersionId, version.id);

			await tx.agentBuilderArtifact.updateMany({
				where: { versionId: version.id, path: input.path },
				data: { previousContent: file.content, content: input.content },
			});

			await tx.agentDefinition.update({
				where: { id: input.id },
				data: { currentVersionId: version.id },
			});

			const repointed = await tx.agentTrigger.updateMany({
				where: { agentId: input.id, versionId: agent.currentVersionId },
				data: { versionId: version.id },
			});

			await tx.agentAuditEvent.create({
				data: {
					agentId: input.id,
					versionId: version.id,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type: "agent.file.saved",
					summary: `Edited ${input.path}`,
					before: { path: input.path, bytes: file.content.length },
					after: {
						path: input.path,
						bytes: input.content.length,
						triggers: repointed.count,
					},
					requestId: input.clientRequestId,
				},
			});

			return { saved: true, versionId: version.id };
		});
	}

	async revise(input: AgentReviseInput, userId: string) {
		const versionId = await this.trigger.withTasks(async (tx, queue) => {
			await this.access.assertCanManageInTransaction(tx, input.id, userId);
			const agent = await this.lockAgent(tx, input.id);

			const replay = await tx.agentAuditEvent.findFirst({
				where: {
					agentId: input.id,
					type: "agent.revised",
					requestId: input.clientRequestId,
				},
				select: { versionId: true },
			});
			if (replay) return replay.versionId;

			if (!agent.currentVersionId) {
				throw new BadRequestException("This agent has no deployed version.");
			}

			const current = await tx.agentVersion.findFirstOrThrow({
				where: { id: agent.currentVersionId },
				select: {
					status: true,
					instructions: true,
					manifest: true,
					modelId: true,
					modelContextWindowTokens: true,
					sandboxPolicy: true,
					validation: true,
					sourceConversationId: true,
					deployedAt: true,
					approvedAt: true,
				},
			});

			const parsed = agentManifest.safeParse(current.manifest);
			if (!parsed.success) {
				throw new BadRequestException(
					"This version's manifest cannot be read, so it cannot be changed.",
				);
			}

			const manifest = parsed.data;
			const before = manifest.actions.find(
				(action) => action.destination !== undefined,
			);

			let actions = manifest.actions;

			if (input.actions) {
				const keep = new Set(input.actions);
				actions = actions.filter((action) => keep.has(action.type));
				if (actions.length === 0) {
					throw new BadRequestException("An agent needs at least one action.");
				}
			}

			const channel = input.channel;

			if (channel) {
				if (!actions.some((action) => action.destination !== undefined)) {
					throw new BadRequestException(
						"None of this agent's actions post to a channel, so its channel cannot be changed.",
					);
				}
				if (
					actions.some(
						(action) => action.destination?.resolution === "run-channel",
					)
				) {
					throw new BadRequestException(
						"This agent posts to the channel the run opens. There is no standing channel to change.",
					);
				}

				actions = actions.map((action) => {
					if (action.destination?.resolution !== "chosen") return action;
					return {
						...action,
						destination: {
							...action.destination,
							id: channel.id,
							label: `#${channel.name}`,
						},
					};
				});
			}

			const dataScope = input.resources
				? {
						...manifest.dataScope,
						mode: input.resources.length > 0 ? "SELECTED" : "WORKSPACE",
						resources: input.resources,
					}
				: manifest.dataScope;

			const version = await tx.agentVersion.create({
				data: {
					agentId: input.id,
					number: await nextVersionNumber(tx, input.id),
					status: current.status,
					instructions: current.instructions,
					manifest: {
						...manifest,
						actions,
						dataScope,
					} as Prisma.InputJsonValue,
					modelId: current.modelId,
					modelContextWindowTokens: current.modelContextWindowTokens,
					sandboxPolicy: current.sandboxPolicy as Prisma.InputJsonValue,
					validation: reviseValidation(
						current.validation,
						manifest.actions.map((action) => action.type),
						actions.map((action) => action.type),
					),
					sourceConversationId: current.sourceConversationId,
					approvedAt: current.approvedAt,
					deployedAt: current.deployedAt,
					createdById: userId,
				},
				select: { id: true },
			});

			await carryArtifactsForward(tx, agent.currentVersionId, version.id);

			await tx.agentDefinition.update({
				where: { id: input.id },
				data: { currentVersionId: version.id },
			});

			const repointed = await tx.agentTrigger.updateMany({
				where: { agentId: input.id, versionId: agent.currentVersionId },
				data: { versionId: version.id },
			});

			if (
				channel &&
				!(
					before?.destination?.resolution === "chosen" &&
					before.destination.id === channel.id
				)
			) {
				await queue.slackChannelJoinRequested(channel.id, channel.name);
			}

			await tx.agentAuditEvent.create({
				data: {
					agentId: input.id,
					versionId: version.id,
					actorUserId: userId,
					actorType: "USER",
					actorId: userId,
					type: "agent.revised",
					summary: reviseSummary(input),
					before: {
						channel:
							before?.destination?.resolution === "chosen"
								? before.destination.label
								: null,
						actions: manifest.actions.map((action) => action.type),
						resources: manifest.dataScope.resources.length,
					},
					after: {
						channel: channel ? `#${channel.name}` : null,
						actions: input.actions ?? null,
						resources: input.resources?.length ?? null,
						triggers: repointed.count,
					},
					requestId: input.clientRequestId,
				},
			});

			return version.id;
		});

		return { versionId };
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
				currentVersionId: string | null;
			}>
		>`
			SELECT id, status, name, description, "currentVersionId"
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

function versionMetadata(manifest: Prisma.JsonValue): VersionMetadata {
	const summary = readAgentManifestSummary(manifest);
	const name = summary.name?.trim() ?? "";
	const description =
		summary.description === undefined
			? undefined
			: summary.description.trim() || null;

	const metadata: VersionMetadata = {};
	if (name) metadata.name = name;
	if (description !== undefined) metadata.description = description;

	return metadata;
}

function readCapabilities(manifest: Prisma.JsonValue | undefined) {
	const parsed = schemas.agents.capabilities.safeParse(manifest);

	if (!parsed.success) {
		return {
			readable: false as const,
			problem: parsed.error.issues
				.map(
					(issue) => `${issue.path.join(".") || "manifest"} ${issue.message}`,
				)
				.join("; "),
			actions: [],
			dataScope: null,
			channel: null,
		};
	}

	const slack = parsed.data.actions.find(
		(action) => action.destination !== undefined,
	);

	return {
		readable: true as const,
		problem: null,
		actions: parsed.data.actions,
		dataScope: parsed.data.dataScope,
		channel: slack?.destination ?? null,
	};
}

function reviseSummary(input: {
	channel?: { name: string };
	actions?: string[];
	resources?: unknown[];
}): string {
	const parts: string[] = [];
	if (input.channel) parts.push(`moved to #${input.channel.name}`);
	if (input.actions) parts.push(`${input.actions.length} actions`);
	if (input.resources) parts.push(`${input.resources.length} records`);
	return parts.length > 0 ? `Changed ${parts.join(", ")}` : "Changed settings";
}

function reviseValidation(
	validation: Prisma.JsonValue,
	before: string[],
	after: string[],
): Prisma.InputJsonValue {
	const removed = before.filter((type) => !after.includes(type));
	const base = versionValidation.parse(validation);

	const capabilities = base.capabilities.flatMap((entry) => {
		const name = capabilityName.parse(entry);
		return name !== null && !removed.includes(name) ? [name] : [];
	});

	return {
		...base,
		status: "passed",
		checkedAt: new Date().toISOString(),
		capabilities,
	};
}

async function nextVersionNumber(
	tx: Prisma.TransactionClient,
	agentId: string,
): Promise<number> {
	const latest = await tx.agentVersion.findFirst({
		where: { agentId },
		orderBy: { number: "desc" },
		select: { number: true },
	});

	return (latest?.number ?? 0) + 1;
}

async function carryArtifactsForward(
	tx: Prisma.TransactionClient,
	fromVersionId: string,
	toVersionId: string,
): Promise<void> {
	const rows = await tx.agentBuilderArtifact.findMany({
		where: { versionId: fromVersionId },
		orderBy: [{ path: "asc" }, { revision: "desc" }],
	});

	const latest = new Map<string, (typeof rows)[number]>();
	for (const row of rows) if (!latest.has(row.path)) latest.set(row.path, row);

	if (latest.size === 0) return;

	await tx.agentBuilderArtifact.createMany({
		data: [...latest.values()].map((row) => ({
			versionId: toVersionId,
			path: row.path,
			language: row.language,
			content: row.content,
			previousContent: row.previousContent,
			revision: row.revision,
			status: row.status,
		})),
	});
}
