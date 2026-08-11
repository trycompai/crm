import { randomUUID } from "node:crypto";
import { db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assignedVariant, OUTREACH_EXPERIMENT } from "../lib/outreach";

const step = z.object({
	step: z.number().int().min(1).max(3),
	subject: z.string().trim().min(1).max(120),
	body: z.string().trim().min(1).max(1_500),
});

export default defineTool({
	description:
		"Store exactly three review-only outreach steps for the prospect's fixed A/B/C assignment. This never approves or sends them.",
	inputSchema: z.object({
		prospectId: z.string(),
		variant: z.enum(["A", "B", "C"]),
		steps: z.array(step).length(3),
	}),
	async execute(input, ctx) {
		const attributes = ctx.session.auth.current?.attributes;
		const taskId =
			typeof attributes?.taskId === "string" ? attributes.taskId : null;
		if (
			attributes?.taskKind !== "outreach-compose" ||
			attributes.prospectId !== input.prospectId ||
			!taskId
		) {
			return {
				written: false as const,
				reason: "Not this prospect's outreach task.",
			};
		}
		const variant = assignedVariant(input.prospectId);
		if (variant !== input.variant) {
			return {
				written: false as const,
				reason: "The experiment assignment cannot be changed.",
			};
		}
		if (new Set(input.steps.map((item) => item.step)).size !== 3) {
			return {
				written: false as const,
				reason: "Steps 1, 2 and 3 are required once each.",
			};
		}
		const task = await db.agentTask.findFirst({
			where: {
				id: taskId,
				kind: "outreach-compose",
				prospectId: input.prospectId,
				finishedAt: null,
			},
			select: { id: true },
		});
		if (!task) {
			return {
				written: false as const,
				reason: "The outreach task is no longer active.",
			};
		}

		const [prospect, inbox, existing] = await Promise.all([
			db.prospect.findUnique({
				where: { id: input.prospectId },
				select: {
					status: true,
					routeStatus: true,
					emailAllowed: true,
					routeEmail: true,
					companyId: true,
					contactId: true,
					company: { select: { ownerId: true } },
				},
			}),
			db.emailInbox.findFirst({
				where: { provider: "AGENTMAIL", isEnabled: true },
				orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
			}),
			db.emailDraft.findFirst({
				where: { prospectId: input.prospectId, status: { not: "REJECTED" } },
				select: { id: true },
			}),
		]);
		if (
			!prospect ||
			!prospect.routeEmail ||
			!prospect.companyId ||
			!prospect.contactId
		) {
			return {
				written: false as const,
				reason: "The promoted prospect route is incomplete.",
			};
		}
		if (
			prospect.status !== "PROMOTED" ||
			prospect.routeStatus !== "SEND_READY_REVIEW" ||
			!prospect.emailAllowed
		) {
			return {
				written: false as const,
				reason: "The deterministic outreach gate has not passed.",
			};
		}
		if (!inbox)
			return {
				written: false as const,
				reason: "No enabled AgentMail inbox is configured.",
			};
		if (existing)
			return {
				written: false as const,
				reason: "An active sequence already exists.",
			};
		const recipient = prospect.routeEmail.toLowerCase();
		const domain = recipient.split("@")[1];
		const [suppressedContact, suppressedDomain] = await Promise.all([
			db.suppressedContact.findUnique({ where: { email: recipient } }),
			domain ? db.suppressedDomain.findUnique({ where: { domain } }) : null,
		]);
		if (suppressedContact || suppressedDomain) {
			return {
				written: false as const,
				reason: "The prospect route is suppressed.",
			};
		}
		const createdById =
			prospect.company?.ownerId ??
			(await db.user.findFirst({ select: { id: true } }))?.id;
		if (!createdById)
			return { written: false as const, reason: "No CRM operator exists." };

		const sequenceId = randomUUID();
		const now = new Date();
		const delays = [0, 3, 7] as const;
		await db.$transaction(
			input.steps
				.sort((a, b) => a.step - b.step)
				.map((item) =>
					db.emailDraft.create({
						data: {
							provider: "AGENTMAIL",
							externalInboxId: inbox.externalInboxId,
							prospectId: input.prospectId,
							companyId: prospect.companyId,
							contactId: prospect.contactId,
							createdById,
							fromEmail: inbox.email,
							recipients: [prospect.routeEmail],
							subject: item.subject,
							plainTextBody: item.body,
							status: "PENDING_APPROVAL",
							experimentKey: OUTREACH_EXPERIMENT,
							variant,
							sequenceId,
							sequenceStep: item.step,
							scheduledFor: new Date(
								now.getTime() +
									(delays[item.step - 1] ?? 0) * 24 * 60 * 60 * 1_000,
							),
						},
					}),
				),
		);

		return { written: true as const, sequenceId, variant, steps: 3 };
	},
});
