import type { Prisma } from "@crm/db";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const DAY_MS = 86_400_000;

export const TASK_WINDOWS = [
	"overdue",
	"today",
	"week",
	"later",
	"none",
] as const;

export type TaskWindow = (typeof TASK_WINDOWS)[number];

export function isTaskWindow(value: string): value is TaskWindow {
	return (TASK_WINDOWS as readonly string[]).includes(value);
}

export const taskDueDayInput = z.iso.date();

export function taskDueDay(value: string): Date {
	const parsed = taskDueDayInput.safeParse(value);
	if (!parsed.success) {
		throw new BadRequestException(`"${value}" is not a calendar day.`);
	}

	return new Date(`${parsed.data}T00:00:00.000Z`);
}

export function parseTaskDueDay(value: string | null | undefined): Date | null {
	if (value === null || value === undefined) return null;
	return taskDueDay(value);
}

export function serializeTaskDueDay(value: Date | null): string | null {
	return value?.toISOString().slice(0, 10) ?? null;
}

export function taskWindowFilter(
	window: TaskWindow,
	today: string,
): Prisma.ActivityWhereInput {
	const startOfToday = taskDueDay(today);
	const startOfTomorrow = new Date(startOfToday.getTime() + DAY_MS);
	const startOfNextWeek = new Date(startOfToday.getTime() + 7 * DAY_MS);

	switch (window) {
		case "overdue":
			return { dueAt: { lt: startOfToday } };
		case "today":
			return { dueAt: { gte: startOfToday, lt: startOfTomorrow } };
		case "week":
			return { dueAt: { gte: startOfTomorrow, lt: startOfNextWeek } };
		case "later":
			return { dueAt: { gte: startOfNextWeek } };
		case "none":
			return { dueAt: null };
	}
}
