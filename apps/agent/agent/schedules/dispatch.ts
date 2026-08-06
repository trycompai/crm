import { defineSchedule } from "eve/schedules";
import crm from "../channels/crm";
import {
	pendingAgentRunIds,
	pendingBuilderSubmissionIds,
	queueDueAgentRuns,
} from "../lib/custom-agent-dispatch";
import { brief, drainAll, taskAuth } from "../lib/dispatch";

export default defineSchedule({
	cron: "* * * * *",
	async run({ receive, waitUntil, appAuth }) {
		waitUntil(
			Promise.all([
				drainAll((task) =>
					receive(crm, {
						message: brief(task),
						target: { taskId: task.id },
						auth: taskAuth(task, appAuth),
					}),
				),
				(async () => {
					await queueDueAgentRuns();
					const [builderIds, runIds] = await Promise.all([
						pendingBuilderSubmissionIds(),
						pendingAgentRunIds(),
					]);

					await Promise.all([
						...builderIds.map((builderSubmissionId) =>
							receive(crm, {
								message: "Continue a queued private agent-builder chat.",
								target: { builderSubmissionId },
								auth: appAuth,
							}),
						),
						...runIds.map((runId) =>
							receive(crm, {
								message: "Execute a queued deployed agent run.",
								target: { runId },
								auth: appAuth,
							}),
						),
					]);
				})(),
			]),
		);
	},
});
