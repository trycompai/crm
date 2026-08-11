import { PRIORITY } from "@crm/db/agent-tasks";
import { scheduleTask } from "./tasks";

export async function ensureInboundSyncTasks(): Promise<void> {
	const dueAt = new Date();
	const tasks: Promise<{ id: string }>[] = [];

	if (process.env.LODE_WEBSITE_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
		tasks.push(
			scheduleTask({
				kind: "website-intake-sync",
				reason: "Import new website access requests",
				dueAt,
				priority: PRIORITY.inbound,
				budget: 0,
			}),
		);
	}

	if (
		process.env.AGENTMAIL_API_KEY?.trim() &&
		process.env.AGENTMAIL_INBOX_ID?.trim()
	) {
		tasks.push(
			scheduleTask({
				kind: "agentmail-sync",
				reason: "Read new AgentMail messages for known CRM records",
				dueAt,
				priority: PRIORITY.inbound,
				budget: 0,
			}),
		);
	}

	if (process.env.GRANOLA_API_KEY?.trim()) {
		tasks.push(
			scheduleTask({
				kind: "granola-sync",
				reason: "Import new and updated Granola meeting notes",
				dueAt,
				priority: PRIORITY.inbound,
				budget: 0,
			}),
		);
	}

	await Promise.all(tasks);
}
