import { EnrichmentStatus } from "@crm/db";
import { sendApprovedAgentMailDraft } from "./agentmail-send";
import { runAgentMailSync } from "./agentmail-sync";
import { APP_AUTH, type AppAuth } from "./app-auth";
import { brandOutcome, runBrand } from "./brand";
import { markRunning, settle } from "./enrichment";
import { runGranolaSync } from "./granola-sync";
import { collapsing, runLimited } from "./pool";
import { runPortrait } from "./portrait";
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

export const VISIBLE_BATCH = 60;
export const VISIBLE_CONCURRENCY = 6;
export const VISIBLE_LEASE_MS = 2 * 60_000;

export const RESEARCH_BATCH = 3;
export const RESEARCH_LEASE_MS = 30 * 60_000;

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

export async function runVisibleLane(): Promise<number> {
	let handled = 0;

	while (handled < VISIBLE_BATCH) {
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

		if (task.kind === "website-intake-sync") {
			const result = await runWebsiteIntakeSync();
			await completeTask(
				task.id,
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
				result.status === "skipped"
					? (result.reason ?? "Granola is not configured.")
					: `Imported ${result.imported} Granola notes; updated ${result.updated}; ${result.matched} matched; ${result.unmatched} unmatched.`,
			);
			return;
		}

		if (task.kind === "email-draft-send" && task.emailDraftId) {
			const result = await sendApprovedAgentMailDraft(task.emailDraftId);
			if ("retryable" in result && result.retryable) return;
			await completeTask(
				task.id,
				result.sent ? "Approved email sent." : result.reason,
			);
			return;
		}

		await completeTask(task.id, "The record this names is gone.");
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		await settle(task, EnrichmentStatus.FAILED, reason).catch(() => {});
		if (task.attempts >= MAX_ATTEMPTS) {
			await completeTask(
				task.id,
				`Failed after ${task.attempts} attempts: ${reason}`,
			).catch(() => {});
			return;
		}
		await releaseTaskForRetry(task.id).catch(() => {});
	}
}

export async function runResearchLane(
	start: (task: LeasedTask) => Promise<{ id: string }>,
): Promise<number> {
	const capacity = directOpenAiEnabled() ? RESEARCH_BATCH : 1;
	const available = Math.max(0, capacity - (await researchInFlightCount()));
	if (available === 0) return 0;

	const tasks = await claimDue(
		available,
		{ except: DIRECT_KINDS },
		RESEARCH_LEASE_MS,
	);
	if (tasks.length === 0) return 0;

	await Promise.all(
		tasks.map(async (task) => {
			try {
				await markRunning(task);
				const session = await start(task);
				await noteSession(task.id, session.id);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				await settle(task, EnrichmentStatus.FAILED, reason).catch(() => {});
			}
		}),
	);

	return tasks.length;
}

function directOpenAiEnabled(): boolean {
	return Boolean(
		process.env.OPENAI_API_KEY?.trim() &&
			process.env.LODE_AGENT_OPENAI_MODEL?.trim(),
	);
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

export const drainAll = collapsing(
	async (start: (task: LeasedTask) => Promise<{ id: string }>) => {
		await retireAbandoned();
		await Promise.all([runVisibleLane(), runResearchLane(start)]);
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
		case "workspace-profile":
			return "Write the profile of the company you work for, so that every other session knows who we are. Read our own site and keep it short.";
		default:
			return `Handle this: ${reason}`;
	}
}
