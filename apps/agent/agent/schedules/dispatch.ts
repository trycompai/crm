import { defineSchedule } from "eve/schedules";
import crm from "../channels/crm";
import { brief, drainAll, taskAuth } from "../lib/dispatch";
import { enqueueDueProspecting } from "../lib/tasks";

export default defineSchedule({
	cron: "* * * * *",
	async run({ receive, waitUntil, appAuth }) {
		waitUntil(
			(async () => {
				await enqueueDueProspecting().catch(() => 0);
				await drainAll((task) =>
					receive(crm, {
						message: brief(task),
						target: { taskId: task.id },
						auth: taskAuth(task, appAuth),
					}),
				);
			})(),
		);
	},
});
