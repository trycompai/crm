import { ActivityType, type Db, type Prisma } from "@crm/db";
import { activityMeta } from "@crm/validation/activity-meta";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
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
	TaskListInput,
	TaskListResult,
	TimelineCounts,
	TimelineFilter,
	TimelineInput,
	TimelineResult,
} from "./activities.contracts";
import {
	isTaskWindow,
	parseTaskDueDay,
	serializeTaskDueDay,
	TASK_WINDOWS,
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

	async tasks(input: TaskListInput): Promise<TaskListResult> {
		const where = this.taskWhere(input);
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
			this.taskFacetCounts(input),
		]);

		return { rows: rows.map(serializeTask), total, facetCounts };
	}

	private taskWhere(input: TaskListInput): Prisma.ActivityWhereInput {
		const where = this.taskBaseWhere(input.q);

		if (input.status === "open") where.completedAt = null;
		if (input.status === "done") where.completedAt = { not: null };

		if (input.createdBy.length > 0) {
			where.createdById = { in: input.createdBy };
		}

		const dueWindows = input.due.filter(isTaskWindow);
		if (dueWindows.length > 0) {
			where.AND = [
				{
					OR: dueWindows.map((window) => taskWindowFilter(window, input.today)),
				},
			];
		}

		return where;
	}

	private async taskFacetCounts(input: TaskListInput) {
		const where = this.taskBaseWhere(input.q);

		const [authors, open, done, ...windowCounts] = await Promise.all([
			this.db.activity.groupBy({
				by: ["createdById"],
				where,
				_count: { _all: true },
			}),
			this.db.activity.count({ where: { ...where, completedAt: null } }),
			this.db.activity.count({
				where: { ...where, completedAt: { not: null } },
			}),
			...TASK_WINDOWS.map((window) =>
				this.db.activity.count({
					where: { ...where, ...taskWindowFilter(window, input.today) },
				}),
			),
		]);

		return {
			status: { open, done },
			createdBy: countsByKey(authors, "createdById"),
			due: Object.fromEntries(
				TASK_WINDOWS.map((window, index) => [window, windowCounts[index] ?? 0]),
			),
		};
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

type Task = Prisma.ActivityGetPayload<{ select: typeof TASK_SELECT }>;

function serializeTask(task: Task) {
	return {
		...task,
		dueAt: serializeTaskDueDay(task.dueAt),
		completedAt: task.completedAt?.toISOString() ?? null,
		createdAt: task.createdAt.toISOString(),
	};
}

type Entry = Prisma.ActivityGetPayload<{ select: typeof ENTRY_SELECT }>;

function serializeEntry(entry: Entry) {
	return {
		...entry,
		occurredAt: entry.occurredAt?.toISOString() ?? null,
		dueAt: serializeTaskDueDay(entry.dueAt),
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
