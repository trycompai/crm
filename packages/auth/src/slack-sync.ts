import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";

const KIND = "slack-people-match";

const REASON = "Read Slack people and channels after the workspace connected";

export async function queueSlackInventorySync(): Promise<void> {
	try {
		const pending = await db.agentTask.findFirst({
			where: { kind: KIND, finishedAt: null },
			select: { id: true },
		});
		if (pending) return;

		await db.agentTask.create({
			data: {
				kind: KIND,
				reason: REASON,
				priority: PRIORITY.slackPeople,
				budget: 1,
				dueAt: new Date(),
			},
		});
	} catch {
		return;
	}
}
