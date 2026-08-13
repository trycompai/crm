import { EnrichmentStatus } from "@crm/db";
import { APP_AUTH, type AppAuth } from "./app-auth";
import { brandOutcome, runBrand } from "./brand";
import { queueEventAgentRuns } from "./custom-agent-dispatch";
import { settledWithin } from "./deadline";
import { DISPATCH } from "./dispatch-config";
import { markRunning, settle } from "./enrichment";
import { brandPassOutcome, runMarketingBrand } from "./marketing-brand";
import { collapsing, runLimited } from "./pool";
import { runPortrait } from "./portrait";
import { runSlackChannelJoin } from "./slack-join-task";
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

		await runLimited(VISIBLE_CONCURRENCY, tasks, runDirect, signal);
		handled += tasks.length;
	}

	return handled;
}

type DirectOutcome = { finished: true } | { finished: false; reason: string };

export async function runDirect(
	task: LeasedTask,
	handle: (task: LeasedTask) => Promise<void> = handleDirect,
	timeoutMs: number = DISPATCH.sweep.itemTimeoutMs,
): Promise<void> {
	const work: Promise<DirectOutcome> = handle(task).then(
		() => ({ finished: true }) as const,
		(error) => ({ finished: false, reason: reasonOf(error) }) as const,
	);

	const outcome = await settledWithin(work, timeoutMs);

	if (outcome.settled) {
		await reconcileDirect(task, outcome.value);
		return;
	}

	pendingItems += 1;
	void work
		.then((late) => reconcileDirect(task, late))
		.finally(() => {
			pendingItems -= 1;
		});
}

async function reconcileDirect(
	task: LeasedTask,
	outcome: DirectOutcome,
): Promise<void> {
	if (outcome.finished) return;

	await settle(task, EnrichmentStatus.FAILED, outcome.reason).catch(() => {});
}

async function handleDirect(task: LeasedTask): Promise<void> {
	if (task.kind === "brand" && task.companyId) {
		const result = await runBrand({ companyId: task.companyId });
		if (result.retryable) return;

		await completeTask(task.id, brandOutcome(result));
		return;
	}

	if (task.kind === "marketing-brand") {
		const pass = await runMarketingBrand().catch(() => null);

		await completeTask(
			task.id,
			pass
				? brandPassOutcome(pass)
				: "The branding pass found nothing usable, so the defaults stand.",
		);
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

	if (task.kind === "slack-channel-join") {
		await completeTask(task.id, await runSlackChannelJoin(task.payload));
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

	let started = 0;

	await Promise.all(
		tasks.map(async (task) => {
			if (signal?.aborted) return;
			started += 1;
			await beginResearch(task, start);
		}),
	);

	return started;
}

type StartOutcome =
	| { accepted: true; sessionId: string }
	| { accepted: false; reason: string };

async function beginResearch(
	task: LeasedTask,
	start: (task: LeasedTask) => Promise<{ id: string }>,
): Promise<void> {
	try {
		await markRunning(task);
	} catch (error) {
		await settle(task, EnrichmentStatus.FAILED, reasonOf(error)).catch(
			() => {},
		);
		return;
	}

	const send: Promise<StartOutcome> = start(task).then(
		(session) => ({ accepted: true, sessionId: session.id }) as const,
		(error) => ({ accepted: false, reason: reasonOf(error) }) as const,
	);

	const outcome = await settledWithin(send, DISPATCH.sweep.startTimeoutMs);

	if (outcome.settled) {
		await reconcileStart(task, outcome.value);
		return;
	}

	pendingStarts += 1;
	void send
		.then((late) => reconcileStart(task, late))
		.finally(() => {
			pendingStarts -= 1;
		});
}

async function reconcileStart(
	task: LeasedTask,
	outcome: StartOutcome,
): Promise<void> {
	if (outcome.accepted) {
		await linkSession(task, outcome.sessionId);
		return;
	}

	await settle(task, EnrichmentStatus.FAILED, outcome.reason).catch(() => {});
}

export async function linkSession(
	task: LeasedTask,
	sessionId: string,
	note: (taskId: string, sessionId: string) => Promise<void> = noteSession,
	link: { attempts: number; retryMs: number } = DISPATCH.research.link,
): Promise<boolean> {
	for (let attempt = 1; attempt <= link.attempts; attempt += 1) {
		try {
			await note(task.id, sessionId);
			return true;
		} catch (error) {
			if (attempt < link.attempts) {
				await new Promise((resolve) =>
					setTimeout(resolve, link.retryMs * attempt),
				);
				continue;
			}

			unlinkedSessions += 1;
			console.error(
				`[agent] Task ${task.id} accepted session ${sessionId}, but the session id was not recorded: ${reasonOf(error)}`,
			);
		}
	}

	return false;
}

function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
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
let pendingStarts = 0;
let pendingItems = 0;
let unlinkedSessions = 0;

const unsettledSweeps = new Set<{ startedAt: Date }>();

function oldestUnsettledAt(): Date | null {
	let oldest: Date | null = null;

	for (const sweep of unsettledSweeps) {
		if (!oldest || sweep.startedAt.getTime() < oldest.getTime()) {
			oldest = sweep.startedAt;
		}
	}

	return oldest;
}

export function dispatchHealth() {
	const startedAt = lastSweepStartedAt;
	const finishedAt = lastSweepFinishedAt;
	const collapsed = Boolean(
		startedAt && (!finishedAt || finishedAt.getTime() < startedAt.getTime()),
	);
	const unsettledAt = oldestUnsettledAt();
	const running = collapsed || unsettledAt !== null;

	const since = collapsed && startedAt ? startedAt : unsettledAt;
	const oldest =
		since && unsettledAt && unsettledAt.getTime() < since.getTime()
			? unsettledAt
			: since;

	return {
		startedAt: startedAt?.toISOString() ?? null,
		finishedAt: finishedAt?.toISOString() ?? null,
		running,
		stalledMs: oldest ? Math.max(0, Date.now() - oldest.getTime()) : 0,
		abandonedSweeps,
		unsettledSweeps: unsettledSweeps.size,
		pendingStarts,
		pendingItems,
		unlinkedSessions,
		lastError: lastSweepError,
	};
}

export const drainAll = collapsing(
	async (start: (task: LeasedTask) => Promise<{ id: string }>) => {
		if (unsettledSweeps.size >= DISPATCH.sweep.maxAbandoned) {
			lastSweepError =
				"An abandoned dispatch sweep is still in flight, so this sweep did not start.";
			console.error(`[agent] ${lastSweepError}`);
			return;
		}

		const startedAt = new Date();
		lastSweepStartedAt = startedAt;
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

				const unsettled = { startedAt };
				unsettledSweeps.add(unsettled);

				const forget = setTimeout(() => {
					if (!unsettledSweeps.delete(unsettled)) return;
					console.error(
						`[agent] An abandoned dispatch sweep never settled within ${DISPATCH.sweep.abandonGraceMs}ms, so dispatch is starting again without it.`,
					);
				}, DISPATCH.sweep.abandonGraceMs);
				forget.unref?.();

				void sweep
					.catch((error) => {
						console.error(
							`[agent] An abandoned dispatch sweep then failed: ${reasonOf(error)}`,
						);
					})
					.finally(() => {
						clearTimeout(forget);
						unsettledSweeps.delete(unsettled);
					});

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
			lastSweepError = reasonOf(error);
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
