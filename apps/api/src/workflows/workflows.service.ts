import {
	type Db,
	type Prisma,
	WorkflowRunStatus,
	WorkflowStatus,
	WorkflowTriggerKind,
} from "@crm/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { FACET_ALL, type ListResult, paginate } from "../trpc/list-input";
import type { WorkflowListInput, WorkflowStep } from "./workflows.contracts";

type WorkflowCreate = {
	name: string;
	description?: string | null;
	status?: WorkflowStatus;
	triggerKind: WorkflowTriggerKind;
	triggerConfig?: unknown;
	steps?: WorkflowStep[];
	clientAccountId?: string | null;
};

export type WorkflowRow = {
	id: string;
	name: string;
	description: string | null;
	status: WorkflowStatus;
	triggerKind: WorkflowTriggerKind;
	stepCount: number;
	runCount: number;
	lastRunAt: string | null;
	clientAccount: { id: string; name: string } | null;
	createdAt: string;
	updatedAt: string;
};

@Injectable()
export class WorkflowsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(input: WorkflowListInput): Promise<ListResult<WorkflowRow>> {
		const where: Prisma.WorkflowDefinitionWhereInput = {};
		if (input.q.trim()) {
			where.OR = [
				{ name: { contains: input.q, mode: "insensitive" } },
				{ description: { contains: input.q, mode: "insensitive" } },
			];
		}
		if (input.status !== FACET_ALL)
			where.status = input.status as WorkflowStatus;
		if (input.trigger !== FACET_ALL)
			where.triggerKind = input.trigger as WorkflowTriggerKind;

		const { skip, take } = paginate(input);
		const [rows, total, statusGroups, triggerGroups] = await Promise.all([
			this.db.workflowDefinition.findMany({
				where,
				orderBy: { updatedAt: "desc" },
				skip,
				take,
				include: {
					clientAccount: { select: { id: true, name: true } },
				},
			}),
			this.db.workflowDefinition.count({ where }),
			this.db.workflowDefinition.groupBy({
				by: ["status"],
				_count: { _all: true },
			}),
			this.db.workflowDefinition.groupBy({
				by: ["triggerKind"],
				_count: { _all: true },
			}),
		]);

		const statusFacet: Record<string, number> = {};
		const triggerFacet: Record<string, number> = {};
		for (const g of statusGroups) statusFacet[g.status] = g._count._all;
		for (const g of triggerGroups) triggerFacet[g.triggerKind] = g._count._all;
		const facetCounts: Record<string, Record<string, number>> = {
			status: statusFacet,
			trigger: triggerFacet,
		};

		return {
			rows: rows.map((r) => ({
				id: r.id,
				name: r.name,
				description: r.description,
				status: r.status,
				triggerKind: r.triggerKind,
				stepCount: Array.isArray(r.steps) ? r.steps.length : 0,
				runCount: r.runCount,
				lastRunAt: r.lastRunAt?.toISOString() ?? null,
				clientAccount: r.clientAccount,
				createdAt: r.createdAt.toISOString(),
				updatedAt: r.updatedAt.toISOString(),
			})),
			total,
			facetCounts,
		};
	}

	async byId(id: string) {
		const row = await this.db.workflowDefinition.findUnique({
			where: { id },
			include: {
				clientAccount: { select: { id: true, name: true } },
				runs: { orderBy: { createdAt: "desc" }, take: 20 },
			},
		});
		if (!row) throw new NotFoundException("Workflow not found");
		return row;
	}

	async create(input: WorkflowCreate): Promise<{ id: string; name: string }> {
		const row = await this.db.workflowDefinition.create({
			data: {
				name: input.name,
				description: input.description ?? null,
				status: input.status ?? WorkflowStatus.DRAFT,
				triggerKind: input.triggerKind,
				triggerConfig: (input.triggerConfig ?? {}) as Prisma.InputJsonValue,
				steps: (input.steps ?? []) as unknown as Prisma.InputJsonValue,
				clientAccountId: input.clientAccountId ?? null,
			},
			select: { id: true, name: true },
		});
		return row;
	}

	async update(
		id: string,
		data: Partial<WorkflowCreate>,
	): Promise<{ id: string }> {
		const patch: Prisma.WorkflowDefinitionUpdateInput = {};
		if (data.name !== undefined) patch.name = data.name;
		if (data.description !== undefined) patch.description = data.description;
		if (data.status !== undefined) patch.status = data.status;
		if (data.triggerKind !== undefined) patch.triggerKind = data.triggerKind;
		if (data.triggerConfig !== undefined)
			patch.triggerConfig = (data.triggerConfig ?? {}) as Prisma.InputJsonValue;
		if (data.steps !== undefined)
			patch.steps = data.steps as unknown as Prisma.InputJsonValue;
		if (data.clientAccountId !== undefined) {
			patch.clientAccount = data.clientAccountId
				? { connect: { id: data.clientAccountId } }
				: { disconnect: true };
		}
		await this.db.workflowDefinition.update({ where: { id }, data: patch });
		return { id };
	}

	async delete(id: string) {
		try {
			await this.db.workflowDefinition.delete({ where: { id } });
			return { id };
		} catch {
			throw new NotFoundException("Workflow not found");
		}
	}

	async enqueueRun(workflowId: string, triggerData: unknown) {
		const workflow = await this.db.workflowDefinition.findUnique({
			where: { id: workflowId },
		});
		if (!workflow || workflow.status !== WorkflowStatus.ACTIVE) return null;
		return this.db.workflowRun.create({
			data: {
				workflowId,
				triggerData: (triggerData ?? {}) as Prisma.InputJsonValue,
				status: WorkflowRunStatus.QUEUED,
			},
		});
	}

	async recentRuns(workflowId: string, limit = 20) {
		const runs = await this.db.workflowRun.findMany({
			where: { workflowId },
			orderBy: { createdAt: "desc" },
			take: limit,
		});
		return runs.map((r) => ({
			id: r.id,
			status: r.status,
			startedAt: r.startedAt?.toISOString() ?? null,
			finishedAt: r.finishedAt?.toISOString() ?? null,
			errorMessage: r.errorMessage,
			createdAt: r.createdAt.toISOString(),
		}));
	}
}
