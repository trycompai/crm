import { db } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import {
	INBOUND_CANDIDATE_REPLAY_TASK_KIND,
	INBOUND_REPLAY_INTERVAL_MS,
} from "./inbound-replay";
import { scheduleTask } from "./tasks";

export { INBOUND_CANDIDATE_REPLAY_TASK_KIND } from "./inbound-replay";

function replayContinuation(
	value: unknown,
): Record<string, string | boolean> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const scopes = value as Record<string, unknown>;
	if (scopes.hasMore !== true) return null;
	const continuation: Record<string, string | boolean> = {};
	if (scopes.websiteDone === true) continuation.websiteDone = true;
	if (scopes.emailDone === true) continuation.emailDone = true;
	if (typeof scopes.nextWebsiteCursor === "string") {
		continuation.websiteExternalId = scopes.nextWebsiteCursor;
	}
	if (typeof scopes.nextEmailCursor === "string") {
		continuation.emailMessageId = scopes.nextEmailCursor;
	}
	return Object.keys(continuation).length > 0 ? continuation : null;
}

async function scheduleInboundReplayTask(dueAt: Date): Promise<{ id: string }> {
	const idempotencyKey = `${INBOUND_CANDIDATE_REPLAY_TASK_KIND}:${Math.floor(Date.now() / INBOUND_REPLAY_INTERVAL_MS)}`;
	return db.$transaction(async (transaction) => {
		await transaction.$executeRaw`
			SELECT pg_advisory_xact_lock(hashtextextended('inbound-candidate-replay-schedule', 0))
		`;
		const sameBucket = await transaction.agentTask.findUnique({
			where: { idempotencyKey },
			select: { id: true },
		});
		if (sameBucket) return sameBucket;
		const unfinished = await transaction.agentTask.findFirst({
			where: {
				kind: INBOUND_CANDIDATE_REPLAY_TASK_KIND,
				finishedAt: null,
			},
			orderBy: { createdAt: "desc" },
			select: { id: true },
		});
		if (unfinished) return unfinished;
		const previous = await transaction.agentTask.findFirst({
			where: {
				kind: INBOUND_CANDIDATE_REPLAY_TASK_KIND,
				finishedAt: { not: null },
			},
			orderBy: { createdAt: "desc" },
			select: { scopes: true },
		});
		const scopes = replayContinuation(previous?.scopes);
		const task = await transaction.agentTask.create({
			data: {
				kind: INBOUND_CANDIDATE_REPLAY_TASK_KIND,
				reason:
					"Replay persisted inbound records into reviewable candidate evidence",
				dueAt,
				priority: PRIORITY.inbound,
				budget: 0,
				idempotencyKey,
				...(scopes ? { scopes } : {}),
			},
			select: { id: true },
		});
		return task;
	});
}

export async function ensureInboundSyncTasks(): Promise<void> {
	const dueAt = new Date();
	const tasks: Promise<{ id: string }>[] = [scheduleInboundReplayTask(dueAt)];

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
