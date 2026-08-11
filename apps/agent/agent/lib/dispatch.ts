import { EnrichmentStatus } from "@crm/db";
import { APP_AUTH, type AppAuth } from "./app-auth";
import { brandOutcome, runBrand } from "./brand";
import { queueEventAgentRuns } from "./custom-agent-dispatch";
import { withDeadline } from "./deadline";
import { DISPATCH } from "./dispatch-config";
import { markRunning, settle } from "./enrichment";
import { collapsing, runLimited } from "./pool";
import { runPortrait } from "./portrait";
import { runSlackPeopleMatch } from "./slack-people";
import {
	claimDue,
	completeTask,
	DIRECT_KINDS,
	type LeasedTask,
	noteSession,
	retireExhausted,
	type TaskSubject,
} from "./tasks";

export const VISIBLE_BATCH = DISPATCH.visible.batch;
export const VISIBLE_CONCURRENCY = DISPATCH.visible.concurrency;
export const VISIBLE_LEASE_MS = DISPATCH.visible.leaseMs;

export const RESEARCH_BATCH = DISPATCH.research.batch;
export const RESEARCH_LEASE_MS = DISPATCH.research.leaseMs;

export async function retireAbandoned(): Promise<void> {
	let abandoned: TaskSubject[] = [];

	try {
		abandoned = await retireExhausted();
	} catch {
		return;
	}

	for (const task of abandoned) {
		await settle(
			task,
			EnrichmentStatus.FAILED,
			"Research was attempted several times and never completed.",
		).catch(() => {});
	}
}

export async function runVisibleLane(signal?: AbortSignal): Promise<number> {
	let handled = 0;

	while (handled < VISIBLE_BATCH) {
		if (signal?.aborted) break;

		const tasks = await claimDue(
			Math.min(VISIBLE_CONCURRENCY, VISIBLE_BATCH - handled),
			{ only: DIRECT_KINDS },
			VISIBLE_LEASE_MS,
		);

		if (tasks.length === 0) break;

		await runLimited(VISIBLE_CONCURRENCY, tasks, runDirect);
		handled += tasks.length;
	}

	return handled;
}

async function runDirect(task: LeasedTask): Promise<void> {
	try {
		await withDeadline(
			handleDirect(task),
			DISPATCH.sweep.itemTimeoutMs,
			`This ${task.kind} task ran longer than ${DISPATCH.sweep.itemTimeoutMs}ms and was abandoned.`,
		);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		await settle(task, EnrichmentStatus.FAILED, reason).catch(() => {});
	}
}

async function handleDirect(task: LeasedTask): Promise<void> {
	try {
		if (task.kind === "brand" && task.companyId) {
			const result = await runBrand({ companyId: task.companyId });
			if (result.retryable) return;

			await completeTask(task.id, brandOutcome(result));
			return;
		}

		if (task.kind === "portrait" && task.contactId) {
			const portrait = await runPortrait({
				contactId: task.contactId,
				spend: () => ({ ok: true }),
			});

			await completeTask(
				task.id,
				portrait.stored
					? `Picture stored from ${portrait.source}.`
					: (portrait.reason ?? "No picture found."),
			);
			return;
		}

		if (task.kind === "slack-people-match") {
			await completeTask(task.id, await runSlackPeopleMatch());
			return;
		}

		if (task.kind === "agent-event") {
			const queued = await queueEventAgentRuns(task);
			await completeTask(
				task.id,
				queued === 1
					? "Queued 1 matching agent run."
					: `Queued ${queued} matching agent runs.`,
			);
			return;
		}

		await completeTask(task.id, "The record this names is gone.");
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		await settle(task, EnrichmentStatus.FAILED, reason).catch(() => {});
	}
}

export async function runResearchLane(
	start: (task: LeasedTask) => Promise<{ id: string }>,
	signal?: AbortSignal,
): Promise<number> {
	if (signal?.aborted) return 0;

	const tasks = await claimDue(
		RESEARCH_BATCH,
		{ except: DIRECT_KINDS },
		RESEARCH_LEASE_MS,
	);
	if (tasks.length === 0) return 0;

	await Promise.all(
		tasks.map(async (task) => {
			try {
				await markRunning(task);
				const session = await withDeadline(
					start(task),
					DISPATCH.sweep.startTimeoutMs,
					"The agent did not accept this task in time.",
				);
				await noteSession(task.id, session.id);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				await settle(task, EnrichmentStatus.FAILED, reason).catch(() => {});
			}
		}),
	);

	return tasks.length;
}

export function taskAuth(task: LeasedTask, base: AppAuth = APP_AUTH): AppAuth {
	return {
		...base,
		attributes: {
			taskKind: task.kind,
			reason: task.reason,
			budget: String(task.budget),
			...(task.contactId ? { contactId: task.contactId } : {}),
			...(task.companyId ? { companyId: task.companyId } : {}),
			...(task.dealId ? { dealId: task.dealId } : {}),
		},
	};
}

export const DRAIN_TIMEOUT_MS = DISPATCH.sweep.timeoutMs;

let lastSweepStartedAt: Date | null = null;
let lastSweepFinishedAt: Date | null = null;
let lastSweepError: string | null = null;
let abandonedSweeps = 0;

export function dispatchHealth() {
	const startedAt = lastSweepStartedAt;
	const finishedAt = lastSweepFinishedAt;
	const running = Boolean(
		startedAt && (!finishedAt || finishedAt.getTime() < startedAt.getTime()),
	);

	return {
		startedAt: startedAt?.toISOString() ?? null,
		finishedAt: finishedAt?.toISOString() ?? null,
		running,
		stalledMs:
			running && startedAt ? Math.max(0, Date.now() - startedAt.getTime()) : 0,
		abandonedSweeps,
		lastError: lastSweepError,
	};
}

export const drainAll = collapsing(
	async (start: (task: LeasedTask) => Promise<{ id: string }>) => {
		lastSweepStartedAt = new Date();
		lastSweepError = null;

		const controller = new AbortController();
		const signal = controller.signal;

		const sweep = (async () => {
			await retireAbandoned();
			await Promise.all([
				runVisibleLane(signal),
				runResearchLane(start, signal),
			]);
		})();

		let timer: ReturnType<typeof setTimeout> | undefined;
		const abandon = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				abandonedSweeps += 1;
				controller.abort();
				reject(
					new Error(
						`Dispatch sweep exceeded ${DRAIN_TIMEOUT_MS}ms and was abandoned so the next one can start.`,
					),
				);
			}, DRAIN_TIMEOUT_MS);
		});

		sweep.catch(() => {});

		try {
			await Promise.race([sweep, abandon]);
		} catch (error) {
			lastSweepError = error instanceof Error ? error.message : String(error);
			console.error(`[agent] ${lastSweepError}`);
			throw error;
		} finally {
			clearTimeout(timer);
			lastSweepFinishedAt = new Date();
		}
	},
);

export function brief(task: LeasedTask): string {
	const again =
		task.attempts > 1
			? `This is attempt ${task.attempts}; the earlier one did not finish. Carry on from what is already in this thread rather than starting again. `
			: "";

	return again + work(task.kind, task.reason);
}

function work(kind: string, reason: string): string {
	switch (kind) {
		case "identify":
			return "Work out who this contact actually is, and record what you find. Read what we already have before spending anything.";
		case "profile":
		case "recheck":
			return "Bring this contact's record up to date: their background, their current role, and anything that has changed since we last looked.";
		case "meeting-prep":
			return "There is a meeting with this person soon. Make sure whoever is taking it opens the record knowing who they are dealing with.";
		case "company-profile":
			return "This company's brand, industry, location and links are filled in separately and may already be there. Read the account, fill anything still missing, and write a brief if there is something worth saying.";
		case "workspace-profile":
			return "Write the profile of the company you work for, so that every other session knows who we are. Read our own site and keep it short.";
		default:
			return `Handle this: ${reason}`;
	}
}
