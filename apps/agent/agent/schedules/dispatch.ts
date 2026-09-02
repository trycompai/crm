import { defineSchedule } from "eve/schedules";
import crm from "../channels/crm";
import { sweepBlankFacts } from "../lib/blank-facts";
import {
	pendingAgentRunIds,
	pendingBuilderSubmissionIds,
	queueDueAgentRuns,
} from "../lib/custom-agent-dispatch";
import { brief, drainAll, taskAuth } from "../lib/dispatch";
import {
	pendingSlackEventIds,
	SlackEventNotResumed,
} from "../lib/slack-events";
import { reconcileStaleTasks } from "../lib/stale-tasks";

export default defineSchedule({
	cron: "* * * * *",
	async run({ receive, waitUntil, appAuth }) {
		waitUntil(
			Promise.all([
				sweepBlankFacts(),

				(async () => {
					await reconcileStaleTasks();
					await drainAll((task) =>
						receive(crm, {
							message: brief(task),
							target: { taskId: task.id },
							auth: taskAuth(task, appAuth),
						}),
					);
					await queueDueAgentRuns();
					const [builderIds, runIds, slackEventIds] = await Promise.all([
						pendingBuilderSubmissionIds(),
						pendingAgentRunIds(),
						pendingSlackEventIds(),
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
						...slackEventIds.map((slackEventId) =>
							receive(crm, {
								message: "Resume the agent run a Slack event belongs to.",
								target: { slackEventId },
								auth: appAuth,
							}).catch((error) => {
								if (error instanceof SlackEventNotResumed) return null;
								console.error(
									`[agent] Slack event ${slackEventId} could not be dispatched: ${
										error instanceof Error ? error.message : String(error)
									}`,
								);
								return null;
							}),
						),
					]);
				})(),
			]),
		);
	},
});
