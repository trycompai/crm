import type { RouterInputs } from "@/lib/trpc/types";

type WorkListInput = RouterInputs["work"]["list"];

const WORK_STATES = [
	"all",
	"OPEN",
	"IN_PROGRESS",
	"WAITING",
	"BLOCKED",
	"DONE",
	"DISMISSED",
] as const satisfies readonly NonNullable<WorkListInput["state"]>[];

const WORK_SORTS = [
	"createdAt",
	"updatedAt",
	"dueAt",
	"nextReviewAt",
	"urgency",
	"state",
	"queue",
] as const satisfies readonly NonNullable<WorkListInput["sort"]>[];

const WORK_DUE_FILTERS = [
	"all",
	"overdue",
	"today",
	"upcoming",
	"none",
] as const satisfies readonly NonNullable<WorkListInput["due"]>[];

const DIRECTIONS = ["asc", "desc"] as const satisfies readonly NonNullable<
	WorkListInput["dir"]
>[];

const OWNER_FILTERS = [
	"all",
	"me",
	"unassigned",
] as const satisfies readonly NonNullable<WorkListInput["owner"]>[];

const SUBJECT_TYPES: Record<NonNullable<WorkListInput["subjectType"]>, true> = {
	WORKSPACE: true,
	USER: true,
	COMPANY: true,
	CONTACT: true,
	PROSPECT: true,
	DEAL: true,
	EMAIL_DRAFT: true,
	WORK_ITEM: true,
	CAMPAIGN: true,
	CONTENT_ITEM: true,
	CONTENT_VARIANT: true,
	EXPERIMENT: true,
	SOCIAL_MENTION: true,
	SUPPORT_CASE: true,
	CUSTOMER_ACCOUNT: true,
	CUSTOMER_INSTANCE: true,
	PROVIDER_ACCOUNT: true,
	PROVIDER_RESOURCE: true,
	PLAN: true,
	CONTROL_COMMAND: true,
	PROVIDER_OPERATION: true,
	CONTACT_CANDIDATE: true,
};

type SubjectType = NonNullable<WorkListInput["subjectType"]>;

export type WorkSearchValues = {
	q: string;
	sort: string;
	dir: string;
	page: number;
	pageSize: number;
	state: string;
	queue: string;
	assignee: string;
	due: string;
	subjectType: string;
};

export type WorkAssigneeUser = { id: string; name: string };
export type WorkAssigneeOption = { value: string; label: string };

export function workAssigneeOptions(
	counts: Record<string, number> | undefined,
	users: readonly WorkAssigneeUser[],
): WorkAssigneeOption[] {
	return [
		{ value: "me", label: "My work" },
		{ value: "unassigned", label: "Unassigned" },
		...users
			.filter((user) => (counts?.[user.id] ?? 0) > 0)
			.map((user) => ({ value: user.id, label: user.name })),
	];
}

function oneOf<T extends string>(
	value: string,
	allowed: readonly T[],
	fallback: T,
): T {
	return allowed.some((candidate) => candidate === value)
		? (allowed.find((candidate) => candidate === value) ?? fallback)
		: fallback;
}

export function toWorkListInput(values: WorkSearchValues): WorkListInput {
	const assignee = values.assignee.trim();
	const isNamedAssignee =
		assignee !== "" && !["all", "me", "unassigned"].includes(assignee);
	const subjectType = isSubjectType(values.subjectType)
		? values.subjectType
		: undefined;

	return {
		q: values.q.trim(),
		sort: oneOf(values.sort, WORK_SORTS, "updatedAt"),
		dir: oneOf(values.dir, DIRECTIONS, "desc"),
		page: values.page > 0 ? values.page : 1,
		pageSize: values.pageSize,
		state: oneOf(values.state, WORK_STATES, "all"),
		queue: values.queue.trim() || "all",
		owner: isNamedAssignee ? "all" : oneOf(assignee, OWNER_FILTERS, "all"),
		...(isNamedAssignee ? { ownerId: assignee } : {}),
		due: oneOf(values.due, WORK_DUE_FILTERS, "all"),
		...(subjectType ? { subjectType } : {}),
	};
}

function isSubjectType(value: string): value is SubjectType {
	return Object.hasOwn(SUBJECT_TYPES, value);
}

export function workFocusHistory(open: boolean): "push" | "replace" {
	return open ? "push" : "replace";
}
