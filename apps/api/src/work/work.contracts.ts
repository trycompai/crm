import { z } from "zod";
import {
	isoDateInput,
	kernelListInput,
	ownerFilterInput,
	subjectTypeInput,
} from "../operating-kernel/operating-kernel.contracts";

const workStates = [
	"all",
	"OPEN",
	"IN_PROGRESS",
	"WAITING",
	"BLOCKED",
	"DONE",
	"DISMISSED",
] as const;

const workSorts = [
	"createdAt",
	"updatedAt",
	"dueAt",
	"nextReviewAt",
	"urgency",
	"state",
	"queue",
] as const;

export const workListInput = kernelListInput.extend({
	state: z.enum(workStates).default("all"),
	queue: z.string().trim().max(80).default("all"),
	owner: ownerFilterInput.default("all"),
	ownerId: z.string().min(1).optional(),
	subjectType: subjectTypeInput.optional(),
	due: z.enum(["all", "overdue", "today", "upcoming", "none"]).default("all"),
	sort: z.enum(workSorts).default("updatedAt"),
});

export const workIdInput = z.object({ id: z.string().min(1) });

export const workMutationInput = workIdInput.extend({
	expectedVersion: z.number().int().min(0),
	clientRequestId: z.string().uuid(),
});

export const workAssignInput = workMutationInput.extend({
	assigneeId: z.string().min(1).nullable(),
});

export const workWaitInput = workMutationInput.extend({
	reason: z.string().trim().min(1).max(2_000),
	nextReviewAt: isoDateInput,
});

export const workReasonInput = workMutationInput.extend({
	reason: z.string().trim().min(1).max(2_000),
});

export type WorkListInput = z.infer<typeof workListInput>;
export type WorkMutationInput = z.infer<typeof workMutationInput>;
export type WorkAssignInput = z.infer<typeof workAssignInput>;
export type WorkWaitInput = z.infer<typeof workWaitInput>;
export type WorkReasonInput = z.infer<typeof workReasonInput>;
