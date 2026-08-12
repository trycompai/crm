import { EnrichmentStatus } from "@crm/db";
import { sendApprovedAgentMailDraft } from "./agentmail-send";
import { runAgentMailSync } from "./agentmail-sync";
import { APP_AUTH, type AppAuth } from "./app-auth";
import {
	directOpenAiAllowed,
	directTaskKinds,
	modelSpendPaused,
	outreachSendsPaused,
} from "./autonomy";
import { brandOutcome, runBrand } from "./brand";
import { queueEventAgentRuns } from "./custom-agent-dispatch";
import { settledWithin } from "./deadline";
import { DISPATCH } from "./dispatch-config";
import { markRunning, settle } from "./enrichment";
import { runGranolaSync } from "./granola-sync";
import {
	INBOUND_CANDIDATE_REPLAY_TASK_KIND,
	type InboundReplayCursor,
	inboundReplayOutcomeText,
	runInboundCandidateReplay,
} from "./inbound-replay";
import { collapsing, runLimited } from "./pool";
import { runPortrait } from "./portrait";
import { runSlackChannelJoin } from "./slack-join-task";
import { runSlackPeopleMatch } from "./slack-people";
import {
	claimDue,
	completeTask,
	DIRECT_KINDS,
	type LeasedTask,
	MAX_ATTEMPTS,
	noteSession,
	releaseTaskForRetry,
	researchInFlightCount,
	retireExhausted,
	type TaskSubject,
} from "./tasks";
import { runWebsiteIntakeSync } from "./website-intake";

const DETERMINISTIC_DIRECT_KINDS = [
	...DIRECT_KINDS,
	INBOUND_CANDIDATE_REPLAY_TASK_KIND,
];

function replayCursor(value: unknown): InboundReplayCursor {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const scopes = value as Record<string, unknown>;
	return {
		...(scopes.websiteDone === true ? { websiteDone: true } : {}),
		...(scopes.emailDone === true ? { emailDone: true } : {}),
		...(typeof scopes.websiteExternalId === "string"
			? { websiteExternalId: scopes.websiteExternalId }
			: {}),
		...(typeof scopes.emailMessageId === "string"
			? { emailMessageId: scopes.emailMessageId }
			: {}),
	};
}

export const VISIBLE_BATCH = DISPATCH.visible.batch;
export const VISIBLE_CONCURRENCY = DISPATCH.visible.concurrency;
export const VISIBLE_LEASE_MS = DISPATCH.visible.leaseMs;

export const RESEARCH_BATCH = DISPATCH.research.batch;
export const RESEARCH_LEASE_MS = DISPATCH.research.leaseMs;

export async function retireAbandoned(): Promise<void> {
	let abandoned: TaskSubject[] = [];

	try {
		abandoned = await retireExhausted(
			outreachSendsPaused() ? ["email-draft-send"] : [],
		);
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
			{ only: directTaskKinds(DETERMINISTIC_DIRECT_KINDS) },
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

	await failLeasedTask(task, outcome.reason);
}

async function handleDirect(task: LeasedTask): Promise<void> {
	if (task.kind === "brand" && task.companyId) {
		const result = await runBrand({
			companyId: task.companyId,
			lease: {
				taskId: task.id,
				expectedAttempt: task.attempts,
				companyId: task.companyId,
			},
		});
		if (result.retryable) return;

		await completeTask(task.id, task.attempts, brandOutcome(result));
		return;
	}

	if (task.kind === "portrait" && task.contactId) {
		const portrait = await runPortrait({
			contactId: task.contactId,
			spend: () => ({ ok: true }),
			lease: {
				taskId: task.id,
				expectedAttempt: task.attempts,
				contactId: task.contactId,
			},
		});
		if (portrait.retryable) {
			await releaseTaskForRetry(task.id, task.attempts);
			return;
		}

		await completeTask(
			task.id,
			task.attempts,
			portrait.stored
				? `Picture stored from ${portrait.source}.`
				: (portrait.reason ?? "No picture found."),
		);
		return;
	}

	if (task.kind === "slack-people-match") {
		await completeTask(task.id, task.attempts, await runSlackPeopleMatch());
		return;
	}

	if (task.kind === "slack-channel-join") {
		await completeTask(
			task.id,
			task.attempts,
			await runSlackChannelJoin(task.payload),
		);
		return;
	}

	if (task.kind === "agent-event") {
		const queued = await queueEventAgentRuns(task);
		await completeTask(
			task.id,
			task.attempts,
			queued === 1
				? "Queued 1 matching agent run."
				: `Queued ${queued} matching agent runs.`,
		);
		return;
	}

	if (task.kind === "website-intake-sync") {
		const result = await runWebsiteIntakeSync();
		await completeTask(
			task.id,
			task.attempts,
			result.status === "skipped"
				? (result.reason ?? "Website intake is not configured.")
				: `Imported ${result.imported} website enquiries; ${result.duplicates} already present; ${result.tests} test records.`,
		);
		return;
	}

	if (task.kind === "agentmail-sync") {
		const result = await runAgentMailSync();
		await completeTask(
			task.id,
			task.attempts,
			result.status === "skipped"
				? (result.reason ?? "AgentMail is not configured.")
				: `Stored ${result.written} AgentMail messages; ${result.duplicates} already present; ${result.ignored} non-inbound.`,
		);
		return;
	}

	if (task.kind === "granola-sync") {
		const result = await runGranolaSync();
		await completeTask(
			task.id,
			task.attempts,
			result.status === "skipped"
				? (result.reason ?? "Granola is not configured.")
				: `Imported ${result.imported} Granola notes; updated ${result.updated}; ${result.matched} matched; ${result.unmatched} unmatched.`,
		);
		return;
	}

	if (task.kind === INBOUND_CANDIDATE_REPLAY_TASK_KIND) {
		const result = await runInboundCandidateReplay(
			undefined,
			replayCursor(task.scopes),
		);
		await completeTask(
			task.id,
			task.attempts,
			inboundReplayOutcomeText(result),
			undefined,
			{
				hasMore: result.hasMore,
				websiteDone: result.websiteDone,
				emailDone: result.emailDone,
				nextWebsiteCursor: result.nextWebsiteCursor,
				nextEmailCursor: result.nextEmailCursor,
			},
		);
		return;
	}

	if (task.kind === "email-draft-send" && task.emailDraftId) {
		const result = await sendApprovedAgentMailDraft(task.emailDraftId);
		if ("retryable" in result && result.retryable) return;
		await completeTask(
			task.id,
			task.attempts,
			result.sent ? "Approved email sent." : result.reason,
		);
		return;
	}

	await completeTask(task.id, task.attempts, "The record this names is gone.");
}

async function failLeasedTask(task: LeasedTask, reason: string): Promise<void> {
	if (task.attempts >= MAX_ATTEMPTS) {
		const completed = await completeTask(
			task.id,
			task.attempts,
			`Failed after ${task.attempts} attempts: ${reason}`,
		).catch(() => null);
		if (completed) {
			await settle(completed, EnrichmentStatus.FAILED, reason).catch(() => {});
		}
		return;
	}

	const released = await releaseTaskForRetry(task.id, task.attempts).catch(
		() => null,
	);
	if (released) {
		await settle(released, EnrichmentStatus.FAILED, reason).catch(() => {});
	}
}

export async function runResearchLane(
	start: (task: LeasedTask) => Promise<{ id: string }>,
	signal?: AbortSignal,
): Promise<number> {
	if (signal?.aborted || modelSpendPaused()) return 0;

	const capacity = directOpenAiEnabled() ? RESEARCH_BATCH : 1;
	const available = Math.max(
		0,
		capacity - (await researchInFlightCount(DETERMINISTIC_DIRECT_KINDS)),
	);
	if (available === 0) return 0;

	const tasks = await claimDue(
		available,
		{ except: DETERMINISTIC_DIRECT_KINDS },
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
		const running = await markRunning(task, {
			taskId: task.id,
			expectedAttempt: task.attempts,
			contactId: task.contactId,
			companyId: task.companyId,
			prospectId: task.prospectId,
			dealId: task.dealId,
			emailDraftId: task.emailDraftId,
		});
		if (!running) return;
	} catch (error) {
		await failLeasedTask(task, reasonOf(error));
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

	await failLeasedTask(task, outcome.reason);
}

export async function linkSession(
	task: LeasedTask,
	sessionId: string,
	note?: (taskId: string, sessionId: string) => Promise<void>,
	link: { attempts: number; retryMs: number } = DISPATCH.research.link,
): Promise<boolean> {
	const record =
		note ??
		(async (taskId: string, acceptedSessionId: string) => {
			const linked = await noteSession(
				taskId,
				task.attempts,
				acceptedSessionId,
			);
			if (!linked) throw new Error("The task lease is no longer active.");
		});

	for (let attempt = 1; attempt <= link.attempts; attempt += 1) {
		try {
			await record(task.id, sessionId);
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

function directOpenAiEnabled(): boolean {
	return directOpenAiAllowed();
}

export function taskAuth(task: LeasedTask, base: AppAuth = APP_AUTH): AppAuth {
	return {
		...base,
		attributes: {
			taskId: task.id,
			taskKind: task.kind,
			reason: task.reason,
			budget: String(task.budget),
			...(task.contactId ? { contactId: task.contactId } : {}),
			...(task.companyId ? { companyId: task.companyId } : {}),
			...(task.prospectId ? { prospectId: task.prospectId } : {}),
			...(task.dealId ? { dealId: task.dealId } : {}),
			...(task.emailDraftId ? { emailDraftId: task.emailDraftId } : {}),
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
		case "prospect-research":
			return "Research this prospect with the first-customer-research skill. Verify current public demand signals, the actual job posting, a relevant named decision-maker, a public work route and a reviewable draft. Record observed evidence separately from inference. Finish with one successful record_prospect_research write; after a source-receipt rejection, make at most one corrective call. Never send outreach.";
		case "lead-discovery":
			return "Use the first-customer-discovery skill to find a fresh batch of evidence-backed Lode prospects in the requested markets. Record only public company signals, deduplicate them, and queue each retained candidate for full research. Never send outreach.";
		case "outreach-compose":
			return "Use the outreach-sequence skill to prepare one assigned A, B or C three-step sequence for this fully qualified prospect. Keep every message in human review. Finish by calling record_outreach_sequence exactly once. Never send outreach.";
		case "customer-onboarding-plan":
			return "Use the customer-onboarding skill to turn this closed-won deal and its CRM history into a practical systems, data, access and Lode Brain discovery plan. Finish by calling record_customer_onboarding_plan exactly once.";
		case "website-intake-sync":
			return "Import new website access requests into the CRM and queue enrichment for newly created records.";
		case "agentmail-sync":
			return "Read new inbound AgentMail messages into matching CRM records. Do not send email.";
		case "granola-sync":
			return "Import Granola meeting notes into matching CRM records and preserve unmatched notes for review.";
		case INBOUND_CANDIDATE_REPLAY_TASK_KIND:
			return "Replay persisted website and mailbox envelopes into reviewable inbound candidate evidence. Do not create or modify Contact or Company records, accept identity, send, call providers, or use a model.";
		case "workspace-profile":
			return "Write the profile of the company you work for, so that every other session knows who we are. Read our own site and keep it short.";
		default:
			return `Handle this: ${reason}`;
	}
}
