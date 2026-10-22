import { defineSchedule } from "eve/schedules";
import crm from "../channels/crm";
import { sweepBlankFacts } from "../lib/blank-facts";
import {
	pendingAgentRunIds,
	pendingBuilderSubmissionIds,
	queueDueAgentRuns,
} from "../lib/custom-agent-dispatch";
import { brief, drainAll, taskAuth } from "../lib/dispatch";
import { reconcileStaleTasks } from "../lib/stale-tasks";

export default defineSchedule({
	cron: "* * * * *",
	async run({ to, waitUntil, appAuth }) {
		waitUntil(
			Promise.all([
				sweepBlankFacts(),

				(async () => {
					await reconcileStaleTasks();
					await drainAll((task) =>
						to(crm, { taskId: task.id }).send(brief(task), {
							auth: taskAuth(task, appAuth),
						}),
					);
					await queueDueAgentRuns();
					const [builderIds, runIds] = await Promise.all([
						pendingBuilderSubmissionIds(),
						pendingAgentRunIds(),
					]);

					await Promise.all([
						...builderIds.map((builderSubmissionId) =>
							to(crm, { builderSubmissionId }).send(
								"Continue a queued private agent-builder chat.",
								{
									auth: appAuth,
								},
							),
						),
						...runIds.map((runId) =>
							to(crm, { runId }).send("Execute a queued deployed agent run.", {
								auth: appAuth,
							}),
						),
					]);
				})(),
			]),
		);
	},
});
