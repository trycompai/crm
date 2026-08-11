import { db } from "@crm/db";
import { outreachApprovalDigest } from "@crm/db/outreach";
import { z } from "zod";
import { outreachSendsPaused } from "./autonomy";

const createResponse = z.object({ draft_id: z.string().min(1) });
const sendResponse = z.object({
	message_id: z.string().min(1),
	thread_id: z.string().min(1),
});

export async function sendApprovedAgentMailDraft(
	emailDraftId: string,
	request: typeof fetch = fetch,
) {
	if (outreachSendsPaused()) {
		return {
			sent: false as const,
			retryable: true as const,
			reason: "Outbound provider mutations are paused.",
		};
	}
	const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
	if (!apiKey) {
		return {
			sent: false as const,
			retryable: true as const,
			reason: "AgentMail outbound access is not configured.",
		};
	}
	const apiUrl =
		process.env.AGENTMAIL_API_URL?.trim() ?? "https://api.agentmail.to";
	const draft = await db.emailDraft.findUnique({
		where: { id: emailDraftId },
		include: {
			inbox: { select: { isEnabled: true } },
			contact: { select: { email: true } },
			prospect: {
				select: {
					routeEmail: true,
					emailAllowed: true,
					status: true,
					routeStatus: true,
				},
			},
		},
	});
	if (!draft)
		return { sent: false as const, reason: "Draft no longer exists." };
	if (draft.status === "SENT")
		return { sent: true as const, reason: "Already sent." };
	if (draft.status === "SENDING") {
		return {
			sent: false as const,
			reason: "Another worker is sending this draft.",
		};
	}
	if (
		draft.status !== "APPROVED" ||
		!draft.approvedAt ||
		!draft.approvalDigest
	) {
		return { sent: false as const, reason: "Draft is not approved." };
	}
	if (draft.approvalDigest !== outreachApprovalDigest(draft)) {
		await db.emailDraft.update({
			where: { id: draft.id },
			data: {
				status: "PENDING_APPROVAL",
				approvedAt: null,
				approvedById: null,
				approvalDigest: null,
				sendError: "Copy changed after approval. Review it again.",
			},
		});
		return {
			sent: false as const,
			reason: "Approval no longer matches the copy.",
		};
	}
	if (
		!draft.inbox.isEnabled ||
		!draft.prospect?.emailAllowed ||
		draft.prospect.status !== "PROMOTED" ||
		draft.prospect.routeStatus !== "SEND_READY_REVIEW"
	) {
		return block(
			draft.id,
			"Human outreach permission or prospect readiness was revoked.",
		);
	}
	const claimed = await db.emailDraft.updateMany({
		where: { id: draft.id, status: "APPROVED" },
		data: { status: "SENDING", sendError: null },
	});
	if (claimed.count !== 1) {
		return {
			sent: false as const,
			reason: "Another worker claimed this draft.",
		};
	}

	const recipients = recipientList(draft.recipients);
	if (recipients.length !== 1) {
		return block(draft.id, "Exactly one named work recipient is required.");
	}
	const recipient = recipients[0]?.toLowerCase();
	if (!recipient) {
		return block(draft.id, "Exactly one named work recipient is required.");
	}
	if (
		recipient !== draft.contact?.email?.toLowerCase() ||
		recipient !== draft.prospect?.routeEmail?.toLowerCase()
	) {
		return block(
			draft.id,
			"The approved recipient no longer matches the verified prospect route.",
		);
	}
	const recipientDomain = recipient.split("@")[1] ?? null;
	const [suppressedContact, suppressedDomain] = await Promise.all([
		db.suppressedContact.findUnique({ where: { email: recipient } }),
		recipientDomain
			? db.suppressedDomain.findUnique({ where: { domain: recipientDomain } })
			: null,
	]);
	if (suppressedContact || suppressedDomain) {
		return block(draft.id, "Recipient or domain is suppressed.");
	}

	if ((draft.sequenceStep ?? 1) > 1 && draft.sequenceId && draft.contactId) {
		const firstSent = await db.emailDraft.findFirst({
			where: { sequenceId: draft.sequenceId, sentAt: { not: null } },
			orderBy: { sentAt: "asc" },
			select: { sentAt: true },
		});
		if (firstSent?.sentAt) {
			const reply = await db.emailMessage.findFirst({
				where: {
					direction: "INBOUND",
					sentAt: { gt: firstSent.sentAt },
					thread: { contactId: draft.contactId },
				},
				select: { id: true },
			});
			if (reply) {
				await db.emailDraft.updateMany({
					where: {
						sequenceId: draft.sequenceId,
						status: "APPROVED",
						sentAt: null,
					},
					data: {
						status: "REJECTED",
						sendError: "Sequence stopped automatically after a reply.",
					},
				});
				return {
					sent: false as const,
					reason: "Sequence stopped after a reply.",
				};
			}
		}
	}

	let externalDraftId = draft.externalDraftId;
	if (!externalDraftId) {
		if (!(await sendStillAllowed(draft.id, recipient))) {
			return block(
				draft.id,
				"Outreach permission or suppression changed before sending.",
			);
		}
		const response = await request(
			new URL(
				`/v0/inboxes/${encodeURIComponent(draft.externalInboxId)}/drafts`,
				apiUrl,
			),
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${apiKey}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					to: recipients,
					subject: draft.subject,
					text: draft.plainTextBody,
					client_id: draft.id,
					labels: [
						"lode-outreach",
						draft.experimentKey,
						draft.variant ? `variant-${draft.variant}` : null,
						draft.sequenceStep ? `step-${draft.sequenceStep}` : null,
					].filter(Boolean),
				}),
				signal: AbortSignal.timeout(20_000),
			},
		);
		if (!response.ok) {
			const reason = `AgentMail draft creation returned ${response.status}.`;
			await noteError(draft.id, reason);
			return { sent: false as const, retryable: true as const, reason };
		}
		externalDraftId = createResponse.parse(await response.json()).draft_id;
		await db.emailDraft.update({
			where: { id: draft.id },
			data: { externalDraftId },
		});
	}

	if (!(await sendStillAllowed(draft.id, recipient))) {
		return block(
			draft.id,
			"Outreach permission or suppression changed before sending.",
		);
	}
	const response = await request(
		new URL(
			`/v0/inboxes/${encodeURIComponent(draft.externalInboxId)}/drafts/${encodeURIComponent(externalDraftId)}/send`,
			apiUrl,
		),
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
				"idempotency-key": `lode-${draft.id}`,
			},
			body: "{}",
			signal: AbortSignal.timeout(20_000),
		},
	);
	if (!response.ok) {
		const reason = `AgentMail draft send returned ${response.status}.`;
		await noteError(draft.id, reason);
		return { sent: false as const, retryable: true as const, reason };
	}
	const sent = sendResponse.parse(await response.json());
	const sentAt = new Date();
	await db.$transaction(async (tx) => {
		const thread = await tx.emailThread.upsert({
			where: {
				provider_externalThreadId: {
					provider: "AGENTMAIL",
					externalThreadId: sent.thread_id,
				},
			},
			create: {
				rootMessageId: `agentmail:${sent.thread_id}`,
				provider: "AGENTMAIL",
				externalThreadId: sent.thread_id,
				subject: draft.subject,
				companyId: draft.companyId,
				contactId: draft.contactId,
				firstMessageAt: sentAt,
				lastMessageAt: sentAt,
			},
			update: {
				subject: draft.subject,
				companyId: draft.companyId,
				contactId: draft.contactId,
				lastMessageAt: sentAt,
			},
		});
		const finalized = await tx.emailDraft.updateMany({
			where: { id: draft.id, status: "SENDING" },
			data: {
				status: "SENT",
				externalMessageId: sent.message_id,
				threadId: thread.id,
				sentAt,
				sendError: null,
			},
		});
		if (finalized.count === 0) {
			await tx.emailDraft.update({
				where: { id: draft.id },
				data: {
					externalMessageId: sent.message_id,
					threadId: thread.id,
					sentAt,
					sendError:
						"Provider confirmed delivery after the local send authority was revoked.",
				},
			});
		}
		await tx.emailMessage.upsert({
			where: {
				provider_externalMessageId: {
					provider: "AGENTMAIL",
					externalMessageId: sent.message_id,
				},
			},
			create: {
				threadId: thread.id,
				rfcMessageId: `agentmail:${sent.message_id}`,
				provider: "AGENTMAIL",
				externalInboxId: draft.externalInboxId,
				externalThreadId: sent.thread_id,
				externalMessageId: sent.message_id,
				draftId: draft.id,
				direction: "OUTBOUND",
				fromEmail: draft.fromEmail,
				fromName: draft.fromName,
				recipients,
				subject: draft.subject,
				snippet: draft.plainTextBody.slice(0, 240),
				body: draft.plainTextBody,
				sentAt,
			},
			update: { draftId: draft.id, threadId: thread.id },
		});
		const count = await tx.emailMessage.count({
			where: { threadId: thread.id },
		});
		await tx.emailThread.update({
			where: { id: thread.id },
			data: { messageCount: count, lastMessageAt: sentAt },
		});
	});

	return {
		sent: true as const,
		retryable: false as const,
		messageId: sent.message_id,
		threadId: sent.thread_id,
	};
}

function recipientList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

async function block(id: string, reason: string) {
	await db.emailDraft.update({
		where: { id },
		data: { status: "REJECTED", sendError: reason },
	});
	return { sent: false as const, reason };
}

async function noteError(id: string, reason: string): Promise<void> {
	await db.emailDraft.updateMany({
		where: { id, status: "SENDING" },
		data: { status: "APPROVED", sendError: reason.slice(0, 500) },
	});
}

async function sendStillAllowed(
	id: string,
	recipient: string,
): Promise<boolean> {
	if (outreachSendsPaused()) return false;
	const domain = recipient.split("@")[1] ?? null;
	const [draft, suppressedContact, suppressedDomain] = await Promise.all([
		db.emailDraft.findUnique({
			where: { id },
			select: {
				status: true,
				inbox: { select: { isEnabled: true } },
				prospect: {
					select: {
						emailAllowed: true,
						routeEmail: true,
						routeStatus: true,
						status: true,
					},
				},
			},
		}),
		db.suppressedContact.findUnique({ where: { email: recipient } }),
		domain ? db.suppressedDomain.findUnique({ where: { domain } }) : null,
	]);
	return Boolean(
		draft?.status === "SENDING" &&
			draft.inbox.isEnabled &&
			draft.prospect?.emailAllowed &&
			draft.prospect.routeEmail?.toLowerCase() === recipient &&
			draft.prospect.routeStatus === "SEND_READY_REVIEW" &&
			draft.prospect.status === "PROMOTED" &&
			!suppressedContact &&
			!suppressedDomain,
	);
}
