import { createListSearchParams } from "@/components/data-table/list-search-params";

export const tasksSearchParams = createListSearchParams({
	defaultSort: "dueAt",
	defaultDir: "asc",
	tabId: "status",
	tabDefault: "open",
	facetIds: ["due", "createdBy"] as const,
});

const TASK_STATUSES = ["all", "open", "done"] as const;
const TASK_DUE_WINDOWS = ["overdue", "today", "week", "later", "none"] as const;

type TaskStatus = (typeof TASK_STATUSES)[number];
type TaskDueWindow = (typeof TASK_DUE_WINDOWS)[number];

function isTaskStatus(value: string): value is TaskStatus {
	return TASK_STATUSES.some((status) => status === value);
}

function isTaskDueWindow(value: string): value is TaskDueWindow {
	return TASK_DUE_WINDOWS.some((window) => window === value);
}

export function normalizeTasksInput(
	input: ReturnType<typeof tasksSearchParams.toInput>,
) {
	return {
		q: input.q,
		sort: input.sort,
		dir: input.dir,
		page: input.page,
		pageSize: input.pageSize,
		status: isTaskStatus(input.status) ? input.status : "all",
		due: input.due.filter(isTaskDueWindow),
		createdBy: input.createdBy,
	};
}
