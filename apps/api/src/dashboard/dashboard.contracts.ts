import { z } from "zod";
import { taskDueDayInput } from "../activities/task-due-date";

const DASHBOARD_SCOPES = ["me", "everyone"] as const;

export const dashboardSummaryInput = z.object({
	scope: z.enum(DASHBOARD_SCOPES).default("me"),
	today: taskDueDayInput,
});

export type DashboardSummaryInput = z.infer<typeof dashboardSummaryInput>;
