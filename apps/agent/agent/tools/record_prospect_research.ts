import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {
	domainOf,
	isPublicDirectWorkEmail,
	promotePerfectProspect,
	weightedProspectScore,
} from "../lib/prospect-promotion";

const optionalText = z.string().trim().min(1).optional();
const publicUrl = z.string().trim().url();
const sourceType = z
	.enum([
		"OFFICIAL_JOB_POSTING",
		"OFFICIAL_CAREERS",
		"OFFICIAL_TEAM",
		"OFFICIAL_WEBSITE",
		"OFFICIAL_PROJECT",
		"OFFICIAL_NEWS",
		"PUBLIC_PROFESSIONAL",
		"OTHER_PUBLIC",
	])
	.describe(
		"Classify by page content. A dedicated vacancy or a specific current role with duties or application details is OFFICIAL_JOB_POSTING. A generic careers index is OFFICIAL_CAREERS.",
	);

const evidenceInput = z.object({
	receiptId: z.string().trim().min(1),
	sourceType,
	title: z.string().trim().min(1),
	url: publicUrl,
	signalDate: z.string().date().optional(),
	summary: z.string().trim().min(1),
	observed: z.string().trim().min(1),
	inference: optionalText,
});

const dimensionsInput = z.object({
	painStrength: z.number().int().min(0).max(5),
	productFit: z.number().int().min(0).max(5),
	timing: z.number().int().min(0).max(5),
	reachability: z.number().int().min(0).max(5),
	evidenceQuality: z.number().int().min(0).max(5),
});

export default defineTool({
	description:
		"Save one complete First Customer Finder prospect card, observed public evidence, named contact, verified route, reviewable unsent draft and five score dimensions. Promotion into Company and Contact records happens only when the deterministic perfect gate passes.",
	inputSchema: z.object({
		prospectId: z.string(),
		companyProof: z.string().trim().min(1),
		painSignal: z.string().trim().min(1),
		whyFit: z.string().trim().min(1),
		whyNow: z.string().trim().min(1),
		suggestedChannel: z.string().trim().min(1),
		caution: z.string().trim().min(1),
		draftSubject: z.string().trim().min(1).max(120),
		draftBody: z.string().trim().min(1).max(1_500),
		personalHook: optionalText,
		jobDayProblem: optionalText,
		nextAction: z.string().trim().min(1),
		dimensions: dimensionsInput,
		namedPerson: optionalText,
		role: optionalText,
		personSourceUrl: publicUrl.optional(),
		routeEmail: z.string().trim().email().optional(),
		primaryEvidenceUrl: publicUrl.describe(
			"The strongest retained source supporting the pain signal and draft. Prefer the most relevant dedicated official job posting.",
		),
		evidence: z.array(evidenceInput).min(1).max(12),
	}),
	async execute(input, ctx) {
		const attributes = ctx.session.auth.current?.attributes;
		if (
			attributes?.taskKind !== "prospect-research" ||
			attributes.prospectId !== input.prospectId
		) {
			return {
				written: false as const,
				reason: "This result does not belong to the dispatched prospect task.",
			};
		}

		const [existing, task] = await Promise.all([
			db.prospect.findUnique({
				where: { id: input.prospectId },
				select: {
					id: true,
					website: true,
					status: true,
					emailAllowed: true,
				},
			}),
			typeof attributes.taskId === "string"
				? db.agentTask.findUnique({
						where: { id: attributes.taskId },
						select: { prospectId: true, startedAt: true, finishedAt: true },
					})
				: null,
		]);
		if (!existing) {
			return { written: false as const, reason: "No such prospect." };
		}
		if (
			!task ||
			task.prospectId !== input.prospectId ||
			!task.startedAt ||
			task.finishedAt
		) {
			return {
				written: false as const,
				reason: "The research task is no longer active.",
			};
		}
		if (existing.status === "DISQUALIFIED") {
			return {
				written: false as const,
				reason: "A disqualified prospect cannot be rewritten automatically.",
			};
		}

		const receiptIds = input.evidence.map((item) => item.receiptId);
		if (
			new Set(receiptIds).size !== receiptIds.length ||
			new Set(input.evidence.map((item) => item.url)).size !==
				input.evidence.length
		) {
			return {
				written: false as const,
				reason: "Every retained source needs one unique receipt and URL.",
			};
		}
		const receipts = await db.prospectSourceReceipt.findMany({
			where: { id: { in: receiptIds }, prospectId: input.prospectId },
		});
		if (receipts.length !== receiptIds.length) {
			return {
				written: false as const,
				reason:
					"Every evidence item must use a receipt fetched for this prospect.",
			};
		}
		const receiptsById = new Map(
			receipts.map((receipt) => [receipt.id, receipt]),
		);
		for (const evidence of input.evidence) {
			const receipt = receiptsById.get(evidence.receiptId);
			if (
				!receipt ||
				receipt.fetchedAt < task.startedAt ||
				receipt.finalUrl !== evidence.url ||
				receipt.statusCode < 200 ||
				receipt.statusCode >= 300 ||
				!observationSupported(receipt.contentText, evidence.observed)
			) {
				return {
					written: false as const,
					reason: `Evidence for ${evidence.url} does not match its successful fetch receipt.`,
				};
			}
		}

		const primaryEvidence = input.evidence.find(
			(item) => item.url === input.primaryEvidenceUrl,
		);
		if (!primaryEvidence) {
			return {
				written: false as const,
				reason: "Primary evidence URL is not present in the retained evidence.",
			};
		}
		if (
			input.personSourceUrl &&
			!input.evidence.some((item) => item.url === input.personSourceUrl)
		) {
			return {
				written: false as const,
				reason: "The person source must be present in retained evidence.",
			};
		}

		const fitScore = weightedProspectScore(input.dimensions);
		const routeEmail = input.routeEmail?.toLowerCase() ?? null;
		const directRoute = isPublicDirectWorkEmail(routeEmail, existing.website);
		const routeDomain = domainOf(existing.website);
		const [suppressedContact, suppressedDomain] = directRoute
			? await Promise.all([
					db.suppressedContact.findUnique({
						where: { email: routeEmail as string },
					}),
					routeDomain
						? db.suppressedDomain.findUnique({ where: { domain: routeDomain } })
						: null,
				])
			: [null, null];
		const suppressed = Boolean(suppressedContact || suppressedDomain);
		const named = Boolean(
			input.namedPerson && input.role && input.personSourceUrl,
		);
		const routeStatus = !named
			? "NAMED_PERSON_NEEDED"
			: !routeEmail
				? "NONE"
				: !directRoute
					? "GENERIC_INBOX_BLOCKED"
					: directRoute && !suppressed && existing.emailAllowed
						? "SEND_READY_REVIEW"
						: "DIRECT_ROUTE_REVIEW";
		const now = new Date();
		const companyDomain = domainOf(existing.website);
		const hasCurrentJob = input.evidence.some(
			(item) =>
				item.sourceType === "OFFICIAL_JOB_POSTING" &&
				item.signalDate &&
				new Date(item.signalDate).getTime() >=
					now.getTime() - 120 * 24 * 60 * 60 * 1_000 &&
				new Date(item.signalDate).getTime() <= now.getTime() &&
				domainOf(item.url) === companyDomain,
		);
		const evidenceBacked = input.evidence.length >= 2;
		const status =
			existing.status === "PROMOTED"
				? "PROMOTED"
				: fitScore >= 65 && evidenceBacked && named && hasCurrentJob
					? "QUALIFIED"
					: "REVIEW";
		const blockReason = !named
			? "A relevant named decision-maker and current role are still required."
			: !routeEmail
				? "A public direct work route is still required."
				: !directRoute
					? "The discovered address is generic, personal or off-domain."
					: suppressed
						? "The contact or company is suppressed."
						: existing.emailAllowed
							? null
							: "The route is verified but outreach still requires human permission.";
		const nextResearchAt = new Date(
			now.getTime() +
				(!named || !directRoute ? 7 : hasCurrentJob ? 30 : 14) *
					24 *
					60 *
					60 *
					1_000,
		);

		await db.$transaction(async (tx) => {
			await tx.prospectEvidence.deleteMany({
				where: {
					prospectId: input.prospectId,
					url: { notIn: input.evidence.map((evidence) => evidence.url) },
				},
			});

			await tx.prospect.update({
				where: { id: input.prospectId },
				data: {
					...input.dimensions,
					fitScore,
					status,
					routeStatus,
					painSignal: input.painSignal,
					whyFit: input.whyFit,
					whyNow: input.whyNow,
					companyProof: input.companyProof,
					suggestedChannel: input.suggestedChannel,
					caution: input.caution,
					opener: input.draftBody,
					draftSubject: input.draftSubject,
					draftBody: input.draftBody,
					personalHook: input.personalHook ?? null,
					jobDayProblem: input.jobDayProblem ?? null,
					nextAction: input.nextAction,
					namedPerson: input.namedPerson ?? null,
					role: input.role ?? null,
					personSourceUrl: input.personSourceUrl ?? null,
					sourceUrl: primaryEvidence.url,
					routeEmail: directRoute ? routeEmail : null,
					routeType: directRoute ? "DIRECT_PUBLIC_WORK_EMAIL" : null,
					blockReason,
					lastResearchedAt: now,
					nextResearchAt,
					suppressionCheckedAt: directRoute ? now : null,
					enrichmentStatus: "COMPLETE",
					enrichedAt: now,
					enrichmentError: null,
					researchVersion: { increment: 1 },
				},
			});

			for (const evidence of input.evidence) {
				await tx.prospectEvidence.upsert({
					where: {
						prospectId_url: {
							prospectId: input.prospectId,
							url: evidence.url,
						},
					},
					create: {
						prospectId: input.prospectId,
						...evidence,
						signalDate: evidence.signalDate
							? new Date(evidence.signalDate)
							: null,
						inference: evidence.inference ?? null,
					},
					update: {
						receiptId: evidence.receiptId,
						sourceType: evidence.sourceType,
						title: evidence.title,
						signalDate: evidence.signalDate
							? new Date(evidence.signalDate)
							: null,
						summary: evidence.summary,
						observed: evidence.observed,
						inference: evidence.inference ?? null,
					},
				});
			}
		});

		const promotion = await promotePerfectProspect(input.prospectId);
		return {
			written: true as const,
			fitScore,
			status,
			routeStatus,
			promotion,
		};
	},
});

export function observationSupported(
	content: string,
	observed: string,
): boolean {
	const normalize = (value: string) =>
		value.toLowerCase().replace(/\s+/g, " ").trim();
	const needle = normalize(observed);
	if (needle.length < 20) return false;
	const haystack = normalize(content);
	if (haystack.includes(needle)) return true;
	const words = new Set(
		needle
			.match(/[a-z0-9]+/g)
			?.filter((word) => word.length >= 4 && !STOP_WORDS.has(word)) ?? [],
	);
	if (words.size < 10) return false;
	const supported = [...words].filter((word) => haystack.includes(word)).length;
	return supported / words.size >= 0.65;
}

const STOP_WORDS = new Set([
	"about",
	"after",
	"also",
	"been",
	"company",
	"describes",
	"from",
	"have",
	"identifies",
	"into",
	"lists",
	"more",
	"notes",
	"offers",
	"page",
	"publishes",
	"says",
	"states",
	"that",
	"their",
	"them",
	"this",
	"will",
	"with",
	"would",
]);
