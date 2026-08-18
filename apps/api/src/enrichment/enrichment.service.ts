import type { Db, Prisma } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	type EnrichmentQueueState,
	enrichmentDueLabel,
	enrichmentQueueLine,
	enrichmentQueueState,
} from "./enrichment-copy";

const QUEUE_ROWS = 20;

const SCHEDULED_ROWS = 20;

export type EnrichmentQueueSubject =
	| {
			kind: "contact";
			id: string;
			name: string;
			email: string | null;
			imageUrl: string | null;
	  }
	| {
			kind: "company";
			id: string;
			name: string;
			logoUrl: string | null;
			logoDarkUrl: string | null;
			logoTone: string | null;
	  };

export type EnrichmentQueueRow = {
	id: string;
	state: EnrichmentQueueState;
	line: string;
	startedAt: string | null;
	subject: EnrichmentQueueSubject;
};

export type EnrichmentScheduledRow = {
	id: string;
	due: string;
	subject: EnrichmentQueueSubject;
};

export type EnrichmentQueue = {
	rows: EnrichmentQueueRow[];
	total: number;
	scheduled: EnrichmentScheduledRow[];
	scheduledTotal: number;
};

const TASK_SELECT = {
	id: true,
	contactId: true,
	companyId: true,
	kind: true,
	attempts: true,
	leasedUntil: true,
	startedAt: true,
	dueAt: true,
} as const;

type QueuedTask = {
	id: string;
	contactId: string | null;
	companyId: string | null;
	kind: string;
	attempts: number;
	leasedUntil: Date | null;
	startedAt: Date | null;
	dueAt: Date;
};

@Injectable()
export class EnrichmentService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async queue(): Promise<EnrichmentQueue> {
		const now = new Date();

		const named: Prisma.AgentTaskWhereInput = {
			finishedAt: null,
			OR: [{ contactId: { not: null } }, { companyId: { not: null } }],
		};

		const dueWhere: Prisma.AgentTaskWhereInput = {
			...named,
			dueAt: { lte: now },
		};

		const scheduledWhere: Prisma.AgentTaskWhereInput = {
			...named,
			dueAt: { gt: now },
		};

		const [tasks, total, booked, scheduledTotal] = await Promise.all([
			this.db.agentTask.findMany({
				where: dueWhere,
				orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
				take: QUEUE_ROWS,
				select: TASK_SELECT,
			}),
			this.db.agentTask.count({ where: dueWhere }),
			this.db.agentTask.findMany({
				where: scheduledWhere,
				orderBy: [{ dueAt: "asc" }],
				take: SCHEDULED_ROWS,
				select: TASK_SELECT,
			}),
			this.db.agentTask.count({ where: scheduledWhere }),
		]);

		const everyTask: QueuedTask[] = [...tasks, ...booked];
		const contactIds = unique(everyTask.map((task) => task.contactId));
		const companyIds = unique(everyTask.map((task) => task.companyId));

		const [contacts, companies] = await Promise.all([
			contactIds.length === 0
				? []
				: this.db.contact.findMany({
						where: { id: { in: contactIds } },
						select: {
							id: true,
							firstName: true,
							lastName: true,
							email: true,
							imageUrl: true,
						},
					}),
			companyIds.length === 0
				? []
				: this.db.company.findMany({
						where: { id: { in: companyIds } },
						select: {
							id: true,
							name: true,
							iconUrl: true,
							logoUrl: true,
							iconDarkUrl: true,
							logoDarkUrl: true,
							iconTone: true,
						},
					}),
		]);

		const contactById = new Map(
			contacts.map((contact) => [
				contact.id,
				{
					kind: "contact" as const,
					id: contact.id,
					name:
						[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
						contact.email ||
						"Unnamed contact",
					email: contact.email,
					imageUrl: contact.imageUrl,
				},
			]),
		);

		const companyById = new Map(
			companies.map((company) => [
				company.id,
				{
					kind: "company" as const,
					id: company.id,
					name: company.name,
					logoUrl: company.iconUrl ?? company.logoUrl,
					logoDarkUrl: company.iconDarkUrl ?? company.logoDarkUrl,
					logoTone: company.iconTone,
				},
			]),
		);

		const subjectOf = (task: QueuedTask): EnrichmentQueueSubject | undefined =>
			task.contactId
				? contactById.get(task.contactId)
				: task.companyId
					? companyById.get(task.companyId)
					: undefined;

		const rows: EnrichmentQueueRow[] = [];

		for (const task of tasks) {
			const subject = subjectOf(task);
			if (!subject) continue;

			const state = enrichmentQueueState(task.attempts, task.leasedUntil, now);

			rows.push({
				id: task.id,
				state,
				line: enrichmentQueueLine(state, task.kind),
				startedAt: task.startedAt?.toISOString() ?? null,
				subject,
			});
		}

		const scheduled: EnrichmentScheduledRow[] = [];

		for (const task of booked) {
			const subject = subjectOf(task);
			if (!subject) continue;

			scheduled.push({
				id: task.id,
				due: enrichmentDueLabel(task.dueAt, now),
				subject,
			});
		}

		return { rows, total, scheduled, scheduledTotal };
	}
}

function unique(ids: readonly (string | null)[]): string[] {
	return [...new Set(ids.filter((id): id is string => id !== null))];
}
