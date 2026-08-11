import { type Db, type EmailDraftStatus, type OutreachVariant } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { outreachApprovalDigest } from "@crm/db/outreach";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { OperatingKernelCleanupService } from "../operating-kernel/operating-kernel-cleanup.service";

const EDITABLE = new Set<EmailDraftStatus>([
	"DRAFT",
	"PENDING_APPROVAL",
	"REJECTED",
]);

function emailDomain(email: string): string | null {
	const [, domain] = email.split("@");
	return domain || null;
}

@Injectable()
export class OutreachService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly cleanup: OperatingKernelCleanupService,
	) {}

	async supplyStatus() {
		const sendingPaused =
			process.env.PROVIDER_MUTATIONS_PAUSED?.trim().toLowerCase() !== "false" ||
			process.env.OUTREACH_SENDS_PAUSED?.trim().toLowerCase() !== "false";
		const [prospects, researchOpen, discovery, readyRoutes, inbox] =
			await Promise.all([
				this.db.prospect.groupBy({ by: ["status"], _count: true }),
				this.db.agentTask.count({
					where: { kind: "prospect-research", finishedAt: null },
				}),
				this.db.agentTask.findFirst({
					where: { kind: "lead-discovery", finishedAt: null },
					orderBy: { createdAt: "desc" },
					select: {
						id: true,
						attempts: true,
						startedAt: true,
						createdAt: true,
					},
				}),
				this.db.prospect.findMany({
					where: {
						status: "PROMOTED",
						routeStatus: "SEND_READY_REVIEW",
						emailAllowed: true,
						companyId: { not: null },
						contactId: { not: null },
						routeEmail: { not: null },
					},
					select: { routeEmail: true },
				}),
				this.db.emailInbox.findFirst({
					where: { provider: "AGENTMAIL", isEnabled: true },
					select: { id: true },
				}),
			]);
		const approvedEmails = readyRoutes
			.map((route) => normalizeEmail(route.routeEmail ?? ""))
			.filter((email): email is string => email !== null);
		const routeDomains = [
			...new Set(
				approvedEmails
					.map((email) => emailDomain(email))
					.filter((domain): domain is string => domain !== null),
			),
		];
		const [suppressedContacts, suppressedDomains] = await Promise.all([
			approvedEmails.length > 0
				? this.db.suppressedContact.findMany({
						where: { email: { in: approvedEmails } },
						select: { email: true },
					})
				: [],
			routeDomains.length > 0
				? this.db.suppressedDomain.findMany({
						where: { domain: { in: routeDomains } },
						select: { domain: true },
					})
				: [],
		]);
		const blockedContacts = new Set(
			suppressedContacts
				.map((row) => normalizeEmail(row.email))
				.filter((email): email is string => email !== null),
		);
		const blockedDomains = new Set(suppressedDomains.map((row) => row.domain));
		const blockedRoutes = approvedEmails.filter((email) => {
			const domain = emailDomain(email);
			return (
				blockedContacts.has(email) ||
				Boolean(domain && blockedDomains.has(domain))
			);
		}).length;
		const approvedRoutes = approvedEmails.length;
		const agentMailReady = inbox !== null;
		const sendEligible =
			!sendingPaused && agentMailReady ? approvedRoutes - blockedRoutes : 0;

		return {
			sendingPaused,
			agentMailReady,
			approvedRoutes,
			blockedRoutes,
			sendEligible,
			prospects: Object.fromEntries(
				prospects.map((row) => [row.status, row._count]),
			),
			researchOpen,
			discovery: discovery
				? {
						id: discovery.id,
						state: discovery.startedAt ? "running" : "queued",
						attempts: discovery.attempts,
						createdAt: discovery.createdAt.toISOString(),
					}
				: null,
		};
	}

	async findMore(count: number, countryCodes: string[]) {
		return this.agent.discoverProspects(count, countryCodes);
	}

	async prepare(prospectId: string) {
		const [prospect, inbox] = await Promise.all([
			this.db.prospect.findUnique({
				where: { id: prospectId },
				select: {
					id: true,
					status: true,
					routeStatus: true,
					emailAllowed: true,
					companyId: true,
					contactId: true,
					routeEmail: true,
					emailDrafts: {
						where: { status: { not: "REJECTED" } },
						select: { id: true },
						take: 1,
					},
				},
			}),
			this.db.emailInbox.findFirst({
				where: { provider: "AGENTMAIL", isEnabled: true },
				select: { id: true },
			}),
		]);
		if (!prospect) throw new NotFoundException("Prospect not found.");
		if (prospect.emailDrafts.length > 0)
			return { queued: false, existing: true };
		if (!inbox) {
			throw new BadRequestException("AgentMail is unavailable.");
		}
		if (
			prospect.status !== "PROMOTED" ||
			prospect.routeStatus !== "SEND_READY_REVIEW" ||
			!prospect.emailAllowed ||
			!prospect.companyId ||
			!prospect.contactId ||
			!prospect.routeEmail
		) {
			throw new BadRequestException(
				"Outreach stays locked until the prospect has perfect research, a named contact and a verified public work route.",
			);
		}

		await this.agent.composeOutreach(prospectId);
		return { queued: true, existing: false };
	}

	async setPermission(prospectId: string, allowed: boolean, userId: string) {
		const prospect = await this.db.prospect.findUnique({
			where: { id: prospectId },
			select: {
				status: true,
				routeStatus: true,
				routeEmail: true,
				namedPerson: true,
				role: true,
				personSourceUrl: true,
				contact: { select: { email: true } },
				sourceReceipts: {
					select: { finalUrl: true, contentText: true },
				},
			},
		});
		if (!prospect) throw new NotFoundException("Prospect not found.");

		if (!allowed) {
			await this.db.$transaction([
				this.db.prospect.update({
					where: { id: prospectId },
					data: {
						emailAllowed: false,
						emailAllowedAt: null,
						emailAllowedById: null,
						routeStatus: prospect.routeEmail
							? "DIRECT_ROUTE_REVIEW"
							: prospect.routeStatus,
					},
				}),
				this.db.emailDraft.updateMany({
					where: {
						prospectId,
						status: {
							in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENDING"],
						},
					},
					data: {
						status: "REJECTED",
						sendError: "Outreach permission was revoked by a CRM operator.",
					},
				}),
			]);
			return { prospectId, allowed: false };
		}

		const email = prospect.routeEmail?.trim().toLowerCase();
		const personSource = prospect.sourceReceipts.find(
			(receipt) => receipt.finalUrl === prospect.personSourceUrl,
		);
		const personObserved = Boolean(
			prospect.namedPerson &&
				prospect.role &&
				personSource?.contentText
					.toLowerCase()
					.includes(prospect.namedPerson.toLowerCase()) &&
				personSource.contentText
					.toLowerCase()
					.includes(prospect.role.toLowerCase()),
		);
		const emailObserved = Boolean(
			email &&
				prospect.sourceReceipts.some((receipt) =>
					receipt.contentText.toLowerCase().includes(email),
				),
		);
		if (
			prospect.status !== "PROMOTED" ||
			!email ||
			prospect.contact?.email?.toLowerCase() !== email ||
			!personObserved ||
			!emailObserved
		) {
			throw new BadRequestException(
				"Permission stays locked until retained public evidence shows the named person, current role and exact work email.",
			);
		}

		await this.db.prospect.update({
			where: { id: prospectId },
			data: {
				emailAllowed: true,
				emailAllowedAt: new Date(),
				emailAllowedById: userId,
				routeStatus: "SEND_READY_REVIEW",
			},
		});
		return { prospectId, allowed: true };
	}

	async byProspect(prospectId: string) {
		const [drafts, queued] = await Promise.all([
			this.db.emailDraft.findMany({
				where: { prospectId },
				orderBy: [{ sequenceId: "asc" }, { sequenceStep: "asc" }],
				select: {
					id: true,
					sequenceId: true,
					sequenceStep: true,
					variant: true,
					experimentKey: true,
					status: true,
					subject: true,
					plainTextBody: true,
					fromEmail: true,
					recipients: true,
					scheduledFor: true,
					sentAt: true,
					sendError: true,
					approvedAt: true,
					updatedAt: true,
				},
			}),
			this.db.agentTask.findFirst({
				where: {
					prospectId,
					kind: "outreach-compose",
					finishedAt: null,
				},
				select: { id: true },
			}),
		]);

		return {
			queued: queued !== null,
			drafts: drafts.map((draft) => ({
				...draft,
				scheduledFor: draft.scheduledFor?.toISOString() ?? null,
				sentAt: draft.sentAt?.toISOString() ?? null,
				approvedAt: draft.approvedAt?.toISOString() ?? null,
				updatedAt: draft.updatedAt.toISOString(),
			})),
		};
	}

	async update(
		draftId: string,
		data: { subject: string; plainTextBody: string },
	) {
		const draft = await this.db.emailDraft.findUnique({
			where: { id: draftId },
			select: { id: true, status: true },
		});
		if (!draft) throw new NotFoundException("Draft not found.");
		if (!EDITABLE.has(draft.status)) {
			throw new BadRequestException(
				"An approved or sent email cannot be edited.",
			);
		}

		return this.db.emailDraft.update({
			where: { id: draftId },
			data: {
				subject: data.subject,
				plainTextBody: data.plainTextBody,
				status: "PENDING_APPROVAL",
				approvedAt: null,
				approvedById: null,
				approvalDigest: null,
				sendError: null,
			},
			select: { id: true, status: true, updatedAt: true },
		});
	}

	async approveSequence(sequenceId: string, userId: string) {
		const drafts = await this.db.emailDraft.findMany({
			where: { sequenceId },
			orderBy: { sequenceStep: "asc" },
		});
		if (drafts.length === 0) throw new NotFoundException("Sequence not found.");
		if (drafts.some((draft) => draft.status !== "PENDING_APPROVAL")) {
			throw new BadRequestException("This sequence has already started.");
		}
		if (
			drafts.some(
				(draft) =>
					!draft.subject.trim() ||
					!draft.plainTextBody.trim() ||
					!draft.scheduledFor,
			)
		) {
			throw new BadRequestException(
				"Every sequence step needs copy and a send time.",
			);
		}

		const [firstDraft] = drafts;
		if (!firstDraft) throw new NotFoundException("Sequence not found.");
		const prospectId = firstDraft.prospectId;
		if (
			!prospectId ||
			drafts.some((draft) => draft.prospectId !== prospectId)
		) {
			throw new BadRequestException("A sequence must belong to one prospect.");
		}
		const prospect = await this.db.prospect.findUnique({
			where: { id: prospectId },
			select: {
				status: true,
				routeStatus: true,
				emailAllowed: true,
				routeEmail: true,
				contactId: true,
			},
		});
		if (
			prospect?.status !== "PROMOTED" ||
			prospect.routeStatus !== "SEND_READY_REVIEW" ||
			!prospect.emailAllowed ||
			!prospect.routeEmail ||
			!prospect.contactId
		) {
			throw new BadRequestException(
				"Prospect permission or send readiness changed.",
			);
		}
		const recipient = prospect.routeEmail.toLowerCase();
		if (
			drafts.some((draft) => {
				const recipients = Array.isArray(draft.recipients)
					? draft.recipients.filter(
							(value): value is string => typeof value === "string",
						)
					: [];
				return (
					recipients.length !== 1 || recipients[0]?.toLowerCase() !== recipient
				);
			})
		) {
			throw new BadRequestException(
				"The draft recipient no longer matches the verified route.",
			);
		}
		const domain = recipient.split("@")[1];
		const [suppressedContact, suppressedDomain, inbox] = await Promise.all([
			this.db.suppressedContact.findUnique({ where: { email: recipient } }),
			domain
				? this.db.suppressedDomain.findUnique({ where: { domain } })
				: null,
			this.db.emailInbox.findFirst({
				where: {
					provider: "AGENTMAIL",
					externalInboxId: firstDraft.externalInboxId,
					isEnabled: true,
				},
				select: { id: true },
			}),
		]);
		if (suppressedContact || suppressedDomain || !inbox) {
			throw new BadRequestException(
				"The recipient is suppressed or AgentMail is unavailable.",
			);
		}

		const now = new Date();
		const delays = [0, 3, 7];
		await this.db.$transaction(async (tx) => {
			const [lockedInbox] = await tx.$queryRaw<Array<{ isEnabled: boolean }>>`
				SELECT "isEnabled"
				FROM "emailInbox"
				WHERE id = ${inbox.id}
				FOR UPDATE
			`;
			if (!lockedInbox?.isEnabled) {
				throw new BadRequestException(
					"AgentMail was paused while this sequence was being reviewed.",
				);
			}
			const current = await tx.emailDraft.findMany({
				where: { sequenceId, status: "PENDING_APPROVAL" },
				orderBy: { sequenceStep: "asc" },
			});
			if (current.length !== drafts.length) {
				throw new BadRequestException(
					"This sequence was changed or approved elsewhere.",
				);
			}
			for (const draft of current) {
				const delay = delays[(draft.sequenceStep ?? 1) - 1];
				if (delay === undefined) {
					throw new BadRequestException("Sequence steps must be 1, 2 and 3.");
				}
				const scheduledFor = new Date(
					now.getTime() + delay * 24 * 60 * 60 * 1_000,
				);
				const approved = await tx.emailDraft.updateMany({
					where: { id: draft.id, status: "PENDING_APPROVAL" },
					data: {
						status: "APPROVED",
						approvedById: userId,
						approvedAt: now,
						sendRequestedAt: now,
						scheduledFor,
						approvalDigest: outreachApprovalDigest({ ...draft, scheduledFor }),
						sendError: null,
					},
				});
				if (approved.count !== 1) {
					throw new BadRequestException(
						"This sequence was changed or approved elsewhere.",
					);
				}
				await tx.agentTask.create({
					data: {
						emailDraftId: draft.id,
						kind: "email-draft-send",
						reason:
							"Send an approved outreach sequence step with idempotency and stop rules",
						priority: PRIORITY.outreachSend,
						budget: 0,
						dueAt: scheduledFor,
					},
				});
			}
		});
		this.agent.workQueued();

		return { sequenceId, approved: drafts.length };
	}

	async rejectSequence(sequenceId: string) {
		const result = await this.db.emailDraft.updateMany({
			where: {
				sequenceId,
				status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] },
			},
			data: { status: "REJECTED", sendError: "Rejected by a CRM operator." },
		});
		if (result.count === 0)
			throw new NotFoundException("Editable sequence not found.");
		return { sequenceId, rejected: result.count };
	}

	async deleteDraft(draftId: string) {
		await this.db.$transaction(async (tx) => {
			const draft = await tx.emailDraft.findFirst({
				where: {
					id: draftId,
					status: { in: [...EDITABLE] },
				},
				select: { id: true },
			});
			if (!draft)
				throw new BadRequestException(
					"Only unsent draft proposals can be deleted.",
				);
			await this.cleanup.beforeSubjectDelete(tx, {
				type: "EMAIL_DRAFT",
				id: draft.id,
			});
			await tx.emailDraft.delete({ where: { id: draft.id } });
		});
		return { id: draftId };
	}

	async deleteSequence(sequenceId: string) {
		return this.db.$transaction(async (tx) => {
			const blocked = await tx.emailDraft.count({
				where: {
					sequenceId,
					status: { in: ["APPROVED", "SENDING", "SENT"] },
				},
			});
			if (blocked > 0) {
				throw new BadRequestException(
					"A started sequence can be stopped, but not deleted.",
				);
			}
			const drafts = await tx.emailDraft.findMany({
				where: { sequenceId, status: { in: [...EDITABLE] } },
				select: { id: true },
			});
			if (drafts.length === 0) {
				throw new BadRequestException(
					"Only an unsent sequence can be deleted.",
				);
			}
			for (const draft of drafts) {
				await this.cleanup.beforeSubjectDelete(tx, {
					type: "EMAIL_DRAFT",
					id: draft.id,
				});
			}
			const result = await tx.emailDraft.deleteMany({
				where: { id: { in: drafts.map((draft) => draft.id) } },
			});
			return { sequenceId, deleted: result.count };
		});
	}

	async performance() {
		const rows = await this.db.emailDraft.findMany({
			where: { variant: { not: null }, sequenceStep: 1 },
			select: {
				variant: true,
				status: true,
				sentAt: true,
				thread: {
					select: {
						messages: {
							where: { direction: "INBOUND" },
							select: { id: true },
							take: 1,
						},
					},
				},
			},
		});
		return (["A", "B", "C"] as OutreachVariant[]).map((variant) => {
			const assigned = rows.filter((row) => row.variant === variant);
			const sent = assigned.filter((row) => row.sentAt).length;
			const replies = assigned.filter(
				(row) => row.thread?.messages.length,
			).length;
			return {
				variant,
				assigned: assigned.length,
				sent,
				replies,
				replyRate: sent === 0 ? null : replies / sent,
			};
		});
	}

	async sequences() {
		const drafts = await this.db.emailDraft.findMany({
			where: { sequenceId: { not: null } },
			orderBy: [{ updatedAt: "desc" }, { sequenceStep: "asc" }],
			select: {
				id: true,
				sequenceId: true,
				sequenceStep: true,
				status: true,
				variant: true,
				subject: true,
				scheduledFor: true,
				sentAt: true,
				sendError: true,
				updatedAt: true,
				prospect: {
					select: {
						id: true,
						companyName: true,
						namedPerson: true,
						countryCode: true,
						routeEmail: true,
					},
				},
				thread: {
					select: {
						messages: {
							where: { direction: "INBOUND" },
							select: { id: true, sentAt: true },
							orderBy: { sentAt: "desc" },
							take: 1,
						},
					},
				},
			},
		});
		const grouped = new Map<string, typeof drafts>();
		for (const draft of drafts) {
			if (!draft.sequenceId) continue;
			const rows = grouped.get(draft.sequenceId) ?? [];
			rows.push(draft);
			grouped.set(draft.sequenceId, rows);
		}

		return [...grouped.entries()]
			.map(([sequenceId, rows]) => {
				const ordered = [...rows].sort(
					(a, b) => (a.sequenceStep ?? 0) - (b.sequenceStep ?? 0),
				);
				const statuses = new Set(ordered.map((row) => row.status));
				const replied = ordered.some((row) => row.thread?.messages.length);
				const state = replied
					? "REPLIED"
					: statuses.has("SENDING") || statuses.has("APPROVED")
						? "ACTIVE"
						: statuses.has("SENT")
							? "SENT"
							: statuses.size === 1 && statuses.has("REJECTED")
								? "STOPPED"
								: "REVIEW";
				return {
					sequenceId,
					state,
					variant: ordered[0]?.variant ?? null,
					prospect: ordered[0]?.prospect ?? null,
					updatedAt:
						ordered[0]?.updatedAt.toISOString() ?? new Date(0).toISOString(),
					steps: ordered.map((row) => ({
						id: row.id,
						step: row.sequenceStep,
						status: row.status,
						subject: row.subject,
						scheduledFor: row.scheduledFor?.toISOString() ?? null,
						sentAt: row.sentAt?.toISOString() ?? null,
						sendError: row.sendError,
					})),
				};
			})
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}
}
