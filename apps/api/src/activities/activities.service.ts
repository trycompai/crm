import { ActivityType, type Db, Prisma } from "@crm/db";
import { activityMeta } from "@crm/validation/activity-meta";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { blankToNull } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	type OrderByColumns,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ActivityCreateInput,
	ActivityEntry,
	ActivityUpdateInput,
	MyTasksInput,
	TaskListInput,
	TaskListResult,
	TimelineCounts,
	TimelineFilter,
	TimelineInput,
	TimelineResult,
} from "./activities.contracts";
import { TASKS } from "./activities-config";
import {
	parseTaskDueDay,
	serializeTaskDueDay,
	taskDayBoundaries,
	taskWindowFilter,
} from "./task-due-date";

const AUTHOR_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const ENTRY_SELECT = {
	id: true,
	type: true,
	subject: true,
	body: true,
	occurredAt: true,
	dueAt: true,
	completedAt: true,
	meta: true,
	createdAt: true,
	createdBy: { select: AUTHOR_SELECT },
	company: { select: { id: true, name: true } },
	contact: { select: { id: true, firstName: true, lastName: true } },
	deal: { select: { id: true, name: true } },

	emailThread: {
		select: {
			id: true,
			messageCount: true,
			lastMessageAt: true,
		},
	},
	calendarEvent: {
		select: {
			id: true,
			startsAt: true,
			endsAt: true,
			isAllDay: true,
			location: true,
			conferenceUrl: true,
			_count: { select: { attendees: true } },
		},
	},
} as const;

const NOTE_TYPES = [
	ActivityType.NOTE,
	ActivityType.CALL,
	ActivityType.EMAIL,
	ActivityType.MEETING,
];

const TASK_SELECT = {
	id: true,
	subject: true,
	dueAt: true,
	completedAt: true,
	createdAt: true,
	createdBy: { select: AUTHOR_SELECT },
	company: {
		select: {
			id: true,
			name: true,
			domain: true,
			iconUrl: true,
			iconDarkUrl: true,
			iconTone: true,
			logoUrl: true,
		},
	},
	contact: { select: { id: true, firstName: true, lastName: true } },
	deal: { select: { id: true, name: true } },
} as const;

const TASK_SORTABLE: OrderByColumns<Prisma.ActivityOrderByWithRelationInput[]> =
	{
		subject: (dir) => [{ subject: { sort: dir, nulls: "last" } }],
		dueAt: (dir) => [
			{ dueAt: { sort: dir, nulls: "last" } },
			{ createdAt: "desc" },
		],
		status: (dir) => [
			{ completedAt: { sort: dir, nulls: "first" } },
			{ dueAt: { sort: "asc", nulls: "last" } },
		],
		company: (dir) => [
			{ company: { name: dir } },
			{ dueAt: { sort: "asc", nulls: "last" } },
		],
		createdBy: (dir) => [
			{ createdBy: { name: dir } },
			{ dueAt: { sort: "asc", nulls: "last" } },
		],
		createdAt: (dir) => [{ createdAt: dir }],
	};

const taskAggregateRow = z.object({
	open: z.coerce.number().int().nonnegative(),
	done: z.coerce.number().int().nonnegative(),
	overdue: z.coerce.number().int().nonnegative(),
	today: z.coerce.number().int().nonnegative(),
	week: z.coerce.number().int().nonnegative(),
	later: z.coerce.number().int().nonnegative(),
	none: z.coerce.number().int().nonnegative(),
});

@Injectable()
export class ActivitiesService {
	private readonly logger = new Logger(ActivitiesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly stamp: ActivityStampService,
	) {}

	async timeline(input: TimelineInput): Promise<TimelineResult> {
		const where = this.anchor(input);
		Object.assign(where, filterClause(input.filter));

		const rows = await this.db.activity.findMany({
			where,
			take: input.limit + 1,
			cursor: input.cursor ? { id: input.cursor } : undefined,
			skip: input.cursor ? 1 : undefined,
			orderBy: [
				{ occurredAt: { sort: "desc", nulls: "last" } },
				{ id: "desc" },
			],
			select: ENTRY_SELECT,
		});

		const hasMore = rows.length > input.limit;
		const entries = hasMore ? rows.slice(0, input.limit) : rows;

		return {
			entries: entries.map(serializeEntry),
			nextCursor: hasMore ? (entries[entries.length - 1]?.id ?? null) : null,
		};
	}

	async timelineCounts(
		input: Pick<TimelineInput, "companyId" | "contactId" | "dealId">,
	): Promise<TimelineCounts> {
		const anchor = this.anchor(input);

		const [all, notes, upcoming, done, email, meetings] = await Promise.all([
			this.db.activity.count({ where: anchor }),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("notes") },
			}),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("upcoming") },
			}),
			this.db.activity.count({ where: { ...anchor, ...filterClause("done") } }),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("email") },
			}),
			this.db.activity.count({
				where: { ...anchor, ...filterClause("meetings") },
			}),
		]);

		return { all, notes, upcoming, done, email, meetings };
	}

	async create(
		input: ActivityCreateInput,
		actingUserId: string,
	): Promise<ActivityEntry> {
		const companyId = await this.resolveCompanyId(input);

		const isTask = input.type === ActivityType.TASK;

		const activity = await this.db.activity.create({
			data: {
				type: input.type,
				subject: blankToNull(input.subject ?? ""),
				body: blankToNull(input.body ?? ""),
				occurredAt: parseDate(input.occurredAt) ?? new Date(),
				dueAt: isTask ? parseTaskDueDay(input.dueAt) : null,
				companyId,
				contactId: input.contactId ?? null,
				dealId: input.dealId ?? null,
				createdById: actingUserId,
			},
			select: ENTRY_SELECT,
		});

		await this.stamp.touch(
			{ companyId, contactId: input.contactId, dealId: input.dealId },
			activity.createdAt,
		);

		this.logger.log({
			message: "Activity logged",
			activityId: activity.id,
			type: activity.type,
		});

		return serializeEntry(activity);
	}

	async update(input: ActivityUpdateInput): Promise<ActivityEntry> {
		await this.requireTask(input.id, "Only tasks can be edited.");

		const updated = await this.db.activity.update({
			where: { id: input.id },
			data: { subject: input.subject, dueAt: parseTaskDueDay(input.dueAt) },
			select: ENTRY_SELECT,
		});

		return serializeEntry(updated);
	}

	async complete(id: string, completed: boolean): Promise<ActivityEntry> {
		await this.requireTask(id, "Only tasks can be completed.");

		const updated = await this.db.activity.update({
			where: { id },
			data: { completedAt: completed ? new Date() : null },
			select: ENTRY_SELECT,
		});

		return serializeEntry(updated);
	}

	async myTasks(
		input: MyTasksInput,
		actingUserId: string,
	): Promise<ActivityEntry[]> {
		const now = new Date();
		const where: Prisma.ActivityWhereInput = {
			type: ActivityType.TASK,
			completedAt: null,
			createdById: actingUserId,
		};

		if (input.window === "overdue") where.dueAt = { lt: now };
		if (input.window === "upcoming") where.dueAt = { gte: now };

		const tasks = await this.db.activity.findMany({
			where,
			take: input.limit,
			orderBy: [
				{ dueAt: { sort: "asc", nulls: "last" } },
				{ createdAt: "desc" },
			],
			select: ENTRY_SELECT,
		});

		return tasks.map(serializeEntry);
	}

	async tasks(input: TaskListInput): Promise<TaskListResult> {
		const now = new Date();
		const where = this.taskWhere(input, now);
		const { skip, take } = paginate(input);

		const [rows, total, facetCounts] = await Promise.all([
			this.db.activity.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, TASK_SORTABLE, [
					{ dueAt: { sort: "asc", nulls: "last" } },
					{ createdAt: "desc" },
				]),
				select: TASK_SELECT,
			}),
			this.db.activity.count({ where }),
			this.taskFacetCounts(input.q, now),
		]);

		return {
			rows: rows.map(serializeTask),
			total,
			day: {
				today: serializeTaskDueDay(taskDayBoundaries(now).startOfToday) ?? "",
				timeZone: TASKS.day.timeZone,
			},
			facetCounts,
		};
	}

	private taskWhere(
		input: TaskListInput,
		now: Date,
	): Prisma.ActivityWhereInput {
		const where = this.taskBaseWhere(input.q);

		if (input.status === "open") where.completedAt = null;
		if (input.status === "done") where.completedAt = { not: null };
		if (input.createdBy.length > 0) {
			where.createdById = { in: input.createdBy };
		}
		if (input.due.length > 0) {
			where.AND = [
				{ OR: input.due.map((window) => taskWindowFilter(window, now)) },
			];
		}

		return where;
	}

	private taskBaseWhere(q: string): Prisma.ActivityWhereInput {
		const term = q.trim();
		const where: Prisma.ActivityWhereInput = { type: ActivityType.TASK };
		if (!term) return where;

		where.OR = [
			{ subject: { contains: term, mode: "insensitive" } },
			{ body: { contains: term, mode: "insensitive" } },
			{ company: { name: { contains: term, mode: "insensitive" } } },
			{ deal: { name: { contains: term, mode: "insensitive" } } },
			{ contact: { firstName: { contains: term, mode: "insensitive" } } },
			{ contact: { lastName: { contains: term, mode: "insensitive" } } },
		];

		return where;
	}

	private async taskFacetCounts(q: string, now: Date) {
		const where = this.taskBaseWhere(q);
		const term = q.trim();
		const search = term
			? Prisma.sql`AND (
				strpos(lower(COALESCE(activity."subject", '')), lower(${term})) > 0
				OR strpos(lower(COALESCE(activity."body", '')), lower(${term})) > 0
				OR strpos(lower(COALESCE(company."name", '')), lower(${term})) > 0
				OR strpos(lower(COALESCE(deal."name", '')), lower(${term})) > 0
				OR strpos(lower(COALESCE(contact."firstName", '')), lower(${term})) > 0
				OR strpos(lower(COALESCE(contact."lastName", '')), lower(${term})) > 0
			)`
			: Prisma.empty;
		const { startOfToday, startOfTomorrow, startOfNextWeek } =
			taskDayBoundaries(now);

		const [authors, aggregateRows] = await Promise.all([
			this.db.activity.groupBy({
				by: ["createdById"],
				where,
				_count: { _all: true },
			}),
			this.db.$queryRaw`
				SELECT
					COUNT(*) FILTER (WHERE activity."completedAt" IS NULL) AS "open",
					COUNT(*) FILTER (WHERE activity."completedAt" IS NOT NULL) AS "done",
					COUNT(*) FILTER (WHERE activity."dueAt" < ${startOfToday}) AS "overdue",
					COUNT(*) FILTER (WHERE activity."dueAt" >= ${startOfToday} AND activity."dueAt" < ${startOfTomorrow}) AS "today",
					COUNT(*) FILTER (WHERE activity."dueAt" >= ${startOfTomorrow} AND activity."dueAt" < ${startOfNextWeek}) AS "week",
					COUNT(*) FILTER (WHERE activity."dueAt" >= ${startOfNextWeek}) AS "later",
					COUNT(*) FILTER (WHERE activity."dueAt" IS NULL) AS "none"
				FROM "activity" activity
				LEFT JOIN "company" company ON company."id" = activity."companyId"
				LEFT JOIN "contact" contact ON contact."id" = activity."contactId"
				LEFT JOIN "deal" deal ON deal."id" = activity."dealId"
				WHERE activity."type" = ${ActivityType.TASK}::"ActivityType"
				${search}
			`,
		]);

		const aggregate = taskAggregateRow.parse(
			z.array(z.unknown()).length(1).parse(aggregateRows)[0],
		);

		return {
			status: { open: aggregate.open, done: aggregate.done },
			createdBy: countsByKey(authors, "createdById"),
			due: {
				overdue: aggregate.overdue,
				today: aggregate.today,
				week: aggregate.week,
				later: aggregate.later,
				none: aggregate.none,
			},
		};
	}

	private async requireTask(id: string, wrongType: string) {
		const activity = await this.db.activity.findUnique({
			where: { id },
			select: { type: true },
		});

		if (!activity) {
			throw new NotFoundException(`No activity with id ${id}.`);
		}

		if (activity.type !== ActivityType.TASK) {
			throw new BadRequestException(wrongType);
		}
	}

	private anchor(
		input: Pick<TimelineInput, "companyId" | "contactId" | "dealId">,
	): Prisma.ActivityWhereInput {
		if (input.dealId) return { dealId: input.dealId };
		if (input.contactId) return { contactId: input.contactId };
		if (input.companyId) return { companyId: input.companyId };
		throw new BadRequestException(
			"A timeline needs a company, a contact or a deal.",
		);
	}

	private async resolveCompanyId(
		input: ActivityCreateInput,
	): Promise<string | null> {
		if (input.companyId) return input.companyId;

		if (input.dealId) {
			const deal = await this.db.deal.findUnique({
				where: { id: input.dealId },
				select: { companyId: true },
			});
			if (!deal) {
				throw new NotFoundException(`No deal with id ${input.dealId}.`);
			}
			return deal.companyId;
		}

		if (input.contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: input.contactId },
				select: { companyId: true },
			});
			if (!contact) {
				throw new NotFoundException(`No contact with id ${input.contactId}.`);
			}
			return contact.companyId;
		}

		return null;
	}
}

function filterClause(filter: TimelineFilter): Prisma.ActivityWhereInput {
	switch (filter) {
		case "notes":
			return { type: { in: NOTE_TYPES } };
		case "upcoming":
			return { type: ActivityType.TASK, completedAt: null };
		case "done":
			return { type: ActivityType.TASK, completedAt: { not: null } };
		case "history":
			return { NOT: { type: ActivityType.TASK, completedAt: null } };
		case "email":
			return { type: ActivityType.EMAIL };
		case "meetings":
			return { type: ActivityType.MEETING };
		case "all":
			return {};
	}
}

type Entry = Prisma.ActivityGetPayload<{ select: typeof ENTRY_SELECT }>;

type Task = Prisma.ActivityGetPayload<{ select: typeof TASK_SELECT }>;

function serializeTask(task: Task) {
	return {
		...task,
		dueAt: serializeTaskDueDay(task.dueAt),
		completedAt: task.completedAt?.toISOString() ?? null,
		createdAt: task.createdAt.toISOString(),
	};
}

function serializeEntry(entry: Entry) {
	return {
		...entry,
		occurredAt: entry.occurredAt?.toISOString() ?? null,
		dueAt: entry.dueAt?.toISOString() ?? null,
		completedAt: entry.completedAt?.toISOString() ?? null,
		createdAt: entry.createdAt.toISOString(),
		meta: activityMeta.parse(entry.meta),

		emailThread: entry.emailThread
			? {
					id: entry.emailThread.id,
					messageCount: entry.emailThread.messageCount,
					lastMessageAt: entry.emailThread.lastMessageAt.toISOString(),
				}
			: null,

		calendarEvent: entry.calendarEvent
			? {
					id: entry.calendarEvent.id,
					startsAt: entry.calendarEvent.startsAt.toISOString(),
					endsAt: entry.calendarEvent.endsAt.toISOString(),
					isAllDay: entry.calendarEvent.isAllDay,
					location: entry.calendarEvent.location,
					conferenceUrl: entry.calendarEvent.conferenceUrl,
					attendeeCount: entry.calendarEvent._count.attendees,
				}
			: null,
	};
}

function parseDate(value: string | null | undefined): Date | null {
	if (value === null || value === undefined || value === "") return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new BadRequestException(`"${value}" is not a date.`);
	}
	return date;
}
