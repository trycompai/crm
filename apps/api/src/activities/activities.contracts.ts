import { ActivityType } from "@crm/db";
import { activityMeta } from "@crm/validation/activity-meta";
import { z } from "zod";
import { listInput } from "../trpc/list-input";
import { taskDueDayInput } from "./task-due-date";

const COMPOSABLE_TYPES = [
	ActivityType.NOTE,
	ActivityType.CALL,
	ActivityType.EMAIL,
	ActivityType.MEETING,
	ActivityType.TASK,
] as const;

const composableEnum = z.enum(COMPOSABLE_TYPES);

const ALL_ACTIVITY_TYPES = [
	ActivityType.NOTE,
	ActivityType.CALL,
	ActivityType.EMAIL,
	ActivityType.MEETING,
	ActivityType.TASK,
	ActivityType.STAGE_CHANGE,
	ActivityType.ENRICHMENT,
] as const;

const activityTypeOutput = z.enum(ALL_ACTIVITY_TYPES);

const TIMELINE_FILTERS = [
	"all",
	"history",
	"notes",
	"upcoming",
	"done",
	"email",
	"meetings",
] as const;

export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];

export const timelineInput = z.object({
	companyId: z.string().optional(),
	contactId: z.string().optional(),
	dealId: z.string().optional(),
	filter: z.enum(TIMELINE_FILTERS).default("all"),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(30),
});

export type TimelineInput = z.infer<typeof timelineInput>;

export const timelineCountsInput = z.object({
	companyId: z.string().optional(),
	contactId: z.string().optional(),
	dealId: z.string().optional(),
});

export const activityCreateInput = z
	.object({
		type: composableEnum,
		subject: z.string().trim().optional(),
		body: z.string().trim().optional(),
		occurredAt: z.string().optional(),
		dueAt: taskDueDayInput.nullable().optional(),
		companyId: z.string().optional(),
		contactId: z.string().optional(),
		dealId: z.string().optional(),
	})
	.refine((input) => input.companyId || input.contactId || input.dealId, {
		message: "An activity has to be about a company, a contact or a deal.",
	})
	.refine(
		(input) => input.type !== ActivityType.TASK || Boolean(input.subject),
		{
			message: "A task needs a subject — it is the thing to do.",
			path: ["subject"],
		},
	);

export type ActivityCreateInput = z.infer<typeof activityCreateInput>;

export const activityUpdateInput = z.object({
	id: z.string(),
	subject: z.string().trim().min(1, {
		message: "A task needs a subject — it is the thing to do.",
	}),
	dueAt: taskDueDayInput.nullable(),
});

export type ActivityUpdateInput = z.infer<typeof activityUpdateInput>;

export const completeInput = z.object({
	id: z.string(),
	completed: z.boolean().default(true),
});

export const taskListInput = listInput.extend({
	status: z.string().default("all"),
	due: z.array(z.string()).default([]),
	createdBy: z.array(z.string()).default([]),
	today: taskDueDayInput,
});

export type TaskListInput = z.infer<typeof taskListInput>;

const activityAuthorOutput = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

const activityCompanyRefOutput = z
	.object({
		id: z.string(),
		name: z.string(),
	})
	.nullable();

const activityContactRefOutput = z
	.object({
		id: z.string(),
		firstName: z.string(),
		lastName: z.string().nullable(),
	})
	.nullable();

const activityDealRefOutput = z
	.object({
		id: z.string(),
		name: z.string(),
	})
	.nullable();

const activityEmailThreadOutput = z
	.object({
		id: z.string(),
		messageCount: z.number(),
		lastMessageAt: z.string(),
	})
	.nullable();

const activityCalendarEventOutput = z
	.object({
		id: z.string(),
		startsAt: z.string(),
		endsAt: z.string(),
		isAllDay: z.boolean(),
		location: z.string().nullable(),
		conferenceUrl: z.string().nullable(),
		attendeeCount: z.number(),
	})
	.nullable();

export const activityEntryOutput = z.object({
	id: z.string(),
	type: activityTypeOutput,
	subject: z.string().nullable(),
	body: z.string().nullable(),
	occurredAt: z.string().nullable(),
	dueAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	meta: activityMeta,
	createdAt: z.string(),
	createdBy: activityAuthorOutput,
	company: activityCompanyRefOutput,
	contact: activityContactRefOutput,
	deal: activityDealRefOutput,
	emailThread: activityEmailThreadOutput,
	calendarEvent: activityCalendarEventOutput,
});

export type ActivityEntry = z.infer<typeof activityEntryOutput>;

export const timelineOutput = z.object({
	entries: z.array(activityEntryOutput),
	nextCursor: z.string().nullable(),
});

export type TimelineResult = z.infer<typeof timelineOutput>;

export const timelineCountsOutput = z.object({
	all: z.number(),
	notes: z.number(),
	upcoming: z.number(),
	done: z.number(),
	email: z.number(),
	meetings: z.number(),
});

export type TimelineCounts = z.infer<typeof timelineCountsOutput>;

const taskCompanyRefOutput = z
	.object({
		id: z.string(),
		name: z.string(),
		domain: z.string().nullable(),
		iconUrl: z.string().nullable(),
		iconDarkUrl: z.string().nullable(),
		iconTone: z.string().nullable(),
		logoUrl: z.string().nullable(),
	})
	.nullable();

const taskRowOutput = z.object({
	id: z.string(),
	subject: z.string().nullable(),
	dueAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	createdAt: z.string(),
	createdBy: activityAuthorOutput,
	company: taskCompanyRefOutput,
	contact: activityContactRefOutput,
	deal: activityDealRefOutput,
});

export const taskListOutput = z.object({
	rows: z.array(taskRowOutput),
	total: z.number(),
	facetCounts: z.record(z.string(), z.record(z.string(), z.number())),
});

export type TaskListResult = z.infer<typeof taskListOutput>;

export const activityCreateOutput = activityEntryOutput;

export const activityUpdateOutput = activityEntryOutput;

export const completeOutput = activityEntryOutput;
