import { EnrichmentStatus } from "@crm/db";
import { defineSchedule } from "eve/schedules";
import crm from "../channels/crm";
import { markRunning, settle } from "../lib/enrichment";
import { runPortrait } from "../lib/portrait";
import {
	claimDue,
	completeTask,
	enqueueDueProspecting,
	noteSession,
	retireExhausted,
} from "../lib/tasks";

const BATCH = 5;

export default defineSchedule({
	cron: "* * * * *",
	async run({ receive, waitUntil, appAuth }) {
		waitUntil(
			(async () => {
				await enqueueDueProspecting().catch(() => 0);
				try {
					for (const abandoned of await retireExhausted()) {
						await settle(
							abandoned,
							EnrichmentStatus.FAILED,
							"Research was attempted several times and never completed.",
						);
					}
				} catch {}

				const tasks = await claimDue(BATCH);
				if (tasks.length === 0) return;

				await Promise.all(
					tasks.map(async (task) => {
						try {
							if (task.kind === "portrait" && task.contactId) {
								const portrait = await runPortrait({
									contactId: task.contactId,
									spend: () => ({ ok: true }),
								});

								// The outcome is the answer, not a tick. The backfill reads
								// these rows to decide who not to look for again, so "no
								// picture on LinkedIn, not on the company's site" has to
								// survive here — otherwise the only record of a month's worth
								// of paid lookups is that they happened.
								await completeTask(
									task.id,
									portrait.stored
										? `Picture stored from ${portrait.source}.`
										: (portrait.reason ?? "No picture found."),
								);
								return;
							}

							await markRunning(task);

							const session = await receive(crm, {
								message: brief(task),
								target: { taskId: task.id },
								auth: {
									...appAuth,
									attributes: {
										taskKind: task.kind,
										reason: task.reason,
										budget: String(task.budget),
										...(task.contactId ? { contactId: task.contactId } : {}),
										...(task.companyId ? { companyId: task.companyId } : {}),
										...(task.productId ? { productId: task.productId } : {}),
										...(task.candidateId
											? { candidateId: task.candidateId }
											: {}),
									},
								},
							});

							await noteSession(task.id, session.id);
						} catch (error) {
							const reason =
								error instanceof Error ? error.message : String(error);

							await settle(task, EnrichmentStatus.FAILED, reason).catch(
								() => {},
							);
						}
					}),
				);
			})(),
		);
	},
});

function brief(task: {
	kind: string;
	reason: string;
	contactId: string | null;
	companyId: string | null;
	productId: string | null;
	candidateId: string | null;
	attempts: number;
}): string {
	const again =
		task.attempts > 1
			? `This is attempt ${task.attempts}; the earlier one did not finish. Carry on from what is already in this thread rather than starting again. `
			: "";

	return again + work(task.kind, task.reason, task.productId);
}

function work(kind: string, reason: string, productId?: string | null): string {
	switch (kind) {
		case "identify":
			return "Work out who this contact actually is, and record what you find. Read what we already have before spending anything.";
		case "profile":
		case "recheck":
			return "Bring this contact's record up to date: their background, their current role, and anything that has changed since we last looked.";
		case "meeting-prep":
			return "There is a meeting with this person soon. Make sure whoever is taking it opens the record knowing who they are dealing with.";
		case "company-profile":
			return "Fill in what we know about this company: brand, industry, location, links. Write a brief if there is something worth saying.";
		case "prospect-discovery":
			return `Run the daily prospect discovery for ${productId ?? "the configured product"}. Use discover_prospects once, report its counts and costs, and do not contact anybody.`;
		case "prospect-draft":
			return "Read the prospect and its evidence, then write one concise, specific first-touch email draft in the product's locale. Mention only supported facts, connect one real signal to the configured offer, and include a simple reply-to-opt-out sentence. Store it with write_prospect_draft. Never approve or send it.";
		default:
			return `Handle this: ${reason}`;
	}
}
