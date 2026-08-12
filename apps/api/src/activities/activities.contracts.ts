import { ActivityType } from "@crm/db";
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
	due: z.string().default("all"),
	createdBy: z.string().default("all"),
	today: taskDueDayInput,
});

export type TaskListInput = z.infer<typeof taskListInput>;
