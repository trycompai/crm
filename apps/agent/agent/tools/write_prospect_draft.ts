import { createHash, randomUUID } from "node:crypto";
import { db, OutreachStatus, OutreachStep, ProspectStatus } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
	description:
		"Store a personalised first-touch prospect email as a DRAFT for human review. It cannot approve or send the message.",
	inputSchema: z.object({
		candidateId: z.string().min(1),
		subject: z.string().trim().min(1).max(200),
		body: z.string().trim().min(1).max(10_000),
	}),
	async execute({ candidateId, subject, body }) {
		const candidate = await db.prospectCandidate.findUnique({
			where: { id: candidateId },
			select: {
				status: true,
				email: true,
				totalScore: true,
				_count: { select: { evidence: true } },
			},
		});
		if (!candidate)
			return { stored: false as const, reason: "No such prospect." };
		if (!candidate.email)
			return { stored: false as const, reason: "No verified recipient email." };
		if (candidate.totalScore < 70 || candidate._count.evidence < 2) {
			return {
				stored: false as const,
				reason: "The qualification gate is not met.",
			};
		}
		if (
			candidate.status !== ProspectStatus.REVIEW &&
			candidate.status !== ProspectStatus.APPROVED
		) {
			return {
				stored: false as const,
				reason: "The prospect is not open for review.",
			};
		}
		const existing = await db.outreachMessage.findUnique({
			where: {
				candidateId_step: { candidateId, step: OutreachStep.FIRST_TOUCH },
			},
			select: { id: true, status: true },
		});
		if (
			existing &&
			existing.status !== OutreachStatus.DRAFT &&
			existing.status !== OutreachStatus.FAILED
		) {
			return {
				stored: false as const,
				reason: "A reviewer has already acted on this draft.",
			};
		}
		const contentHash = createHash("sha256")
			.update(`${candidate.email}\n${subject.trim()}\n${body.trim()}`)
			.digest("hex");
		const message = await db.outreachMessage.upsert({
			where: {
				candidateId_step: { candidateId, step: OutreachStep.FIRST_TOUCH },
			},
			create: {
				candidateId,
				step: OutreachStep.FIRST_TOUCH,
				recipientEmail: candidate.email,
				subject: subject.trim(),
				body: body.trim(),
				contentHash,
				idempotencyKey: randomUUID(),
			},
			update: {
				recipientEmail: candidate.email,
				subject: subject.trim(),
				body: body.trim(),
				contentHash,
				status: OutreachStatus.DRAFT,
				failureReason: null,
			},
			select: { id: true },
		});
		return {
			stored: true as const,
			messageId: message.id,
			status: "DRAFT" as const,
		};
	},
});
