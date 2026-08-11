import { isWorkspaceAdmin, isWorkspaceRole, WORKSPACE_ID } from "@crm/auth";
import { type Db, EmailProvider } from "@crm/db";
import { MAX_ATTEMPTS } from "@crm/db/agent-tasks";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import {
	AgentTriggerService,
	type InboundSyncTaskKind,
} from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	GranolaExcludeInput,
	GranolaMatchInput,
	InboundSyncInput,
} from "./inbound.contracts";

const INBOUND_REPLAY_KIND = "inbound-candidate-replay";

function isSet(key: string): boolean {
	return Boolean(process.env[key]?.trim());
}

function websiteAvailable(): boolean {
	return isSet("LODE_WEBSITE_SUPABASE_SERVICE_ROLE_KEY");
}

function agentMailAvailable(): boolean {
	return isSet("AGENTMAIL_API_KEY") && isSet("AGENTMAIL_INBOX_ID");
}

function granolaAvailable(): boolean {
	return isSet("GRANOLA_API_KEY");
}

function configuredInboundTasks(
	source: InboundSyncInput["source"],
): InboundSyncTaskKind[] {
	const tasks: InboundSyncTaskKind[] = [];

	if ((source === "all" || source === "website") && websiteAvailable()) {
		tasks.push("website-intake-sync");
	}
	if ((source === "all" || source === "agentMail") && agentMailAvailable()) {
		tasks.push("agentmail-sync");
	}
	if ((source === "all" || source === "granola") && granolaAvailable()) {
		tasks.push("granola-sync");
	}

	return tasks;
}

@Injectable()
export class InboundService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async status(userId: string) {
		const [
			websiteTotal,
			websiteTests,
			latestEnquiry,
			inbox,
			messages,
			granolaNotes,
			granolaMatched,
			latestGranola,
			replayReceipts,
			replayCandidates,
			replayReviewCandidates,
			replayProhibitedCandidates,
			latestReplayReceipt,
			latestReplayCandidate,
			tasks,
			member,
		] = await Promise.all([
			this.db.websiteEnquiry.count(),
			this.db.websiteEnquiry.count({ where: { test: true } }),
			this.db.websiteEnquiry.findFirst({
				orderBy: { createdAtSource: "desc" },
				select: { createdAtSource: true, importedAt: true },
			}),
			this.db.emailInbox.findFirst({
				where: { provider: EmailProvider.AGENTMAIL },
				orderBy: { updatedAt: "desc" },
				select: {
					email: true,
					isEnabled: true,
					lastSyncedAt: true,
					lastError: true,
				},
			}),
			this.db.emailMessage.count({
				where: { provider: EmailProvider.AGENTMAIL },
			}),
			this.db.granolaNote.count(),
			this.db.granolaNote.count({
				where: {
					OR: [{ companyId: { not: null } }, { contactId: { not: null } }],
				},
			}),
			this.db.granolaNote.findFirst({
				orderBy: { sourceUpdatedAt: "desc" },
				select: { importedAt: true, sourceUpdatedAt: true },
			}),
			this.db.inboundSourceReceipt.count(),
			this.db.contactCandidate.count(),
			this.db.contactCandidate.count({
				where: {
					status: { in: ["PENDING", "MATCH_PROPOSED"] },
					permissionState: "REVIEW_REQUIRED",
				},
			}),
			this.db.contactCandidate.count({
				where: { permissionState: "PROHIBITED" },
			}),
			this.db.inboundSourceReceipt.findFirst({
				orderBy: { capturedAt: "desc" },
				select: { capturedAt: true },
			}),
			this.db.contactCandidate.findFirst({
				orderBy: { updatedAt: "desc" },
				select: { updatedAt: true },
			}),
			this.db.agentTask.findMany({
				where: {
					kind: {
						in: [
							"website-intake-sync",
							"agentmail-sync",
							"granola-sync",
							INBOUND_REPLAY_KIND,
						],
					},
				},
				orderBy: { createdAt: "desc" },
				take: 12,
				select: {
					kind: true,
					attempts: true,
					state: true,
					startedAt: true,
					leasedUntil: true,
					finishedAt: true,
					outcome: true,
					createdAt: true,
				},
			}),
			this.db.member.findUnique({
				where: {
					organizationId_userId: {
						organizationId: WORKSPACE_ID,
						userId,
					},
				},
				select: { role: true },
			}),
		]);

		const websiteTask = latestTask(tasks, "website-intake-sync");
		const agentMailTask = latestTask(tasks, "agentmail-sync");
		const granolaTask = latestTask(tasks, "granola-sync");
		const replayTask = latestTask(tasks, INBOUND_REPLAY_KIND);
		const websiteConfigured = websiteAvailable();
		const agentMailConfigured = agentMailAvailable();
		const granolaConfigured = granolaAvailable();
		const providerPaused =
			process.env.PROVIDER_MUTATIONS_PAUSED?.trim().toLowerCase() !== "false";
		const outreachPaused =
			process.env.OUTREACH_SENDS_PAUSED?.trim().toLowerCase() !== "false";
		const inboxEnabled = Boolean(inbox?.isEnabled);
		const outboundEnabled = Boolean(
			agentMailConfigured && inboxEnabled && !providerPaused && !outreachPaused,
		);
		const role = member && isWorkspaceRole(member.role) ? member.role : null;

		return {
			website: {
				configured: websiteConfigured,
				total: websiteTotal,
				live: websiteTotal - websiteTests,
				tests: websiteTests,
				latestSourceAt: latestEnquiry?.createdAtSource.toISOString() ?? null,
				lastImportedAt: latestEnquiry?.importedAt.toISOString() ?? null,
				canCheck: websiteConfigured,
				hasHistoricalData: websiteTotal > 0,
				task: websiteTask,
			},
			agentMail: {
				configured: agentMailConfigured,
				outboundEnabled,
				inboxEnabled,
				providerPaused,
				outreachPaused,
				canCheck: agentMailConfigured,
				hasHistoricalData: inbox !== null || messages > 0,
				canResumeOutbound: isWorkspaceAdmin(role),
				inbox: inbox?.email ?? null,
				messages,
				lastSyncedAt: inbox?.lastSyncedAt?.toISOString() ?? null,
				lastError: inbox?.lastError ?? null,
				task: agentMailTask,
			},
			granola: {
				configured: granolaConfigured,
				notes: granolaNotes,
				matched: granolaMatched,
				unmatched: granolaNotes - granolaMatched,
				latestSourceAt: latestGranola?.sourceUpdatedAt.toISOString() ?? null,
				lastImportedAt: latestGranola?.importedAt.toISOString() ?? null,
				canCheck: granolaConfigured,
				hasHistoricalData: granolaNotes > 0,
				task: granolaTask,
			},
			replay: {
				mode: "proposal_only",
				receipts: replayReceipts,
				candidates: replayCandidates,
				reviewCandidates: replayReviewCandidates,
				prohibitedCandidates: replayProhibitedCandidates,
				latestReceiptAt: latestReplayReceipt?.capturedAt.toISOString() ?? null,
				latestCandidateAt:
					latestReplayCandidate?.updatedAt.toISOString() ?? null,
				task: replayTask,
			},
			outboundEnabled,
		};
	}

	async syncNow(userId: string, source: InboundSyncInput["source"] = "all") {
		const result = await this.agent.syncInbound(configuredInboundTasks(source));
		return { ...result, status: await this.status(userId) };
	}

	async setAgentMailEnabled(enabled: boolean, userId: string) {
		const member = await this.db.member.findUnique({
			where: {
				organizationId_userId: { organizationId: WORKSPACE_ID, userId },
			},
			select: { role: true },
		});
		const role = member && isWorkspaceRole(member.role) ? member.role : null;
		if (!role) {
			throw new ForbiddenException(
				"Only a CRM workspace operator can change outbound provider state.",
			);
		}
		if (enabled && !isWorkspaceAdmin(role)) {
			throw new ForbiddenException(
				"Only the CRM owner can resume outbound provider actions.",
			);
		}

		const inbox = await this.db.emailInbox.findFirst({
			where: { provider: EmailProvider.AGENTMAIL },
			orderBy: { updatedAt: "desc" },
			select: { id: true, externalInboxId: true },
		});
		if (!inbox) throw new NotFoundException("AgentMail is not configured.");

		await this.db.$transaction(async (tx) => {
			await tx.emailInbox.update({
				where: { id: inbox.id },
				data: { isEnabled: enabled },
			});
			if (!enabled) {
				await tx.emailDraft.updateMany({
					where: {
						provider: EmailProvider.AGENTMAIL,
						externalInboxId: inbox.externalInboxId,
						status: { in: ["APPROVED", "SENDING"] },
					},
					data: {
						status: "REJECTED",
						sendError: "AgentMail outreach was paused by a CRM operator.",
					},
				});
			}
		});

		return { enabled };
	}

	async granolaReview() {
		const [notes, companies] = await Promise.all([
			this.db.granolaNote.findMany({
				where: { companyId: null, contactId: null },
				orderBy: [{ startedAt: "desc" }, { sourceCreatedAt: "desc" }],
				take: 100,
				select: {
					id: true,
					title: true,
					sourceUrl: true,
					ownerName: true,
					summary: true,
					attendees: true,
					folders: true,
					startedAt: true,
					sourceCreatedAt: true,
				},
			}),
			this.db.company.findMany({
				orderBy: { name: "asc" },
				take: 500,
				select: {
					id: true,
					name: true,
					domain: true,
					contacts: {
						orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
						select: {
							id: true,
							firstName: true,
							lastName: true,
							email: true,
						},
					},
					deals: {
						orderBy: { updatedAt: "desc" },
						select: { id: true, name: true, stage: true },
					},
				},
			}),
		]);

		return {
			notes: notes.map((note) => ({
				...note,
				startedAt: (note.startedAt ?? note.sourceCreatedAt).toISOString(),
				sourceCreatedAt: note.sourceCreatedAt.toISOString(),
			})),
			companies,
		};
	}

	async matchGranola(input: GranolaMatchInput, userId: string) {
		return this.db.$transaction(async (tx) => {
			const [note, company, contact, deal] = await Promise.all([
				tx.granolaNote.findUnique({
					where: { id: input.id },
					select: {
						id: true,
						title: true,
						summary: true,
						startedAt: true,
						sourceCreatedAt: true,
						activityId: true,
					},
				}),
				tx.company.findUnique({
					where: { id: input.companyId },
					select: { id: true },
				}),
				input.contactId
					? tx.contact.findUnique({
							where: { id: input.contactId },
							select: { id: true, companyId: true },
						})
					: null,
				input.dealId
					? tx.deal.findUnique({
							where: { id: input.dealId },
							select: { id: true, companyId: true },
						})
					: null,
			]);

			if (!note)
				throw new NotFoundException("That Granola note no longer exists.");
			if (!company)
				throw new NotFoundException("That company no longer exists.");
			if (input.contactId && contact?.companyId !== company.id) {
				throw new BadRequestException(
					"Choose a contact from the selected company.",
				);
			}
			if (input.dealId && deal?.companyId !== company.id) {
				throw new BadRequestException(
					"Choose a deal from the selected company.",
				);
			}

			const occurredAt = note.startedAt ?? note.sourceCreatedAt;
			const activity = note.activityId
				? await tx.activity.update({
						where: { id: note.activityId },
						data: {
							companyId: company.id,
							contactId: contact?.id ?? null,
							dealId: deal?.id ?? null,
						},
						select: { id: true },
					})
				: await tx.activity.create({
						data: {
							type: "MEETING",
							subject: note.title,
							body: note.summary,
							occurredAt,
							companyId: company.id,
							contactId: contact?.id ?? null,
							dealId: deal?.id ?? null,
							createdById: userId,
						},
						select: { id: true },
					});

			await tx.granolaNote.update({
				where: { id: note.id },
				data: {
					companyId: company.id,
					contactId: contact?.id ?? null,
					dealId: deal?.id ?? null,
					activityId: activity.id,
				},
			});
			await Promise.all([
				tx.company.updateMany({
					where: {
						id: company.id,
						OR: [
							{ lastActivityAt: null },
							{ lastActivityAt: { lt: occurredAt } },
						],
					},
					data: { lastActivityAt: occurredAt },
				}),
				contact
					? tx.contact.updateMany({
							where: {
								id: contact.id,
								OR: [
									{ lastActivityAt: null },
									{ lastActivityAt: { lt: occurredAt } },
								],
							},
							data: { lastActivityAt: occurredAt },
						})
					: Promise.resolve(),
				deal
					? tx.deal.updateMany({
							where: {
								id: deal.id,
								OR: [
									{ lastActivityAt: null },
									{ lastActivityAt: { lt: occurredAt } },
								],
							},
							data: { lastActivityAt: occurredAt },
						})
					: Promise.resolve(),
			]);

			return { id: note.id, companyId: company.id };
		});
	}

	async excludeGranola(input: GranolaExcludeInput) {
		return this.db.$transaction(async (tx) => {
			const note = await tx.granolaNote.findUnique({
				where: { id: input.id },
				select: { id: true, externalId: true, activityId: true },
			});
			if (!note)
				throw new NotFoundException("That Granola note no longer exists.");

			await tx.granolaNoteExclusion.upsert({
				where: { externalId: note.externalId },
				create: { externalId: note.externalId, reason: input.reason },
				update: { reason: input.reason },
			});
			await tx.granolaNote.delete({ where: { id: note.id } });
			if (note.activityId) {
				await tx.activity.deleteMany({
					where: {
						id: note.activityId,
						granolaNotes: { none: {} },
						emailThreadId: null,
						calendarEventId: null,
					},
				});
			}

			return { id: note.id, excluded: true };
		});
	}
}

function latestTask(
	tasks: {
		kind: string;
		attempts: number;
		state: string;
		startedAt: Date | null;
		leasedUntil: Date | null;
		finishedAt: Date | null;
		outcome: string | null;
		createdAt: Date;
	}[],
	kind: string,
) {
	const task = tasks.find((candidate) => candidate.kind === kind);
	if (!task) return null;
	const exhausted = Boolean(
		task.finishedAt &&
			(task.attempts >= MAX_ATTEMPTS || task.outcome?.startsWith("Gave up")),
	);
	const failed =
		task.state === "FAILED" || task.state === "UNKNOWN" || exhausted;
	const running =
		task.state === "LEASED" ||
		(!task.finishedAt &&
			task.startedAt &&
			task.leasedUntil &&
			task.leasedUntil > new Date());
	const finished = task.state === "SUCCEEDED" || task.finishedAt !== null;
	return {
		state: failed
			? "failed"
			: task.state === "CANCELLED"
				? "cancelled"
				: task.state === "WAITING_FOR_APPROVAL"
					? "waiting"
					: finished
						? "finished"
						: running
							? "running"
							: task.attempts > 0
								? "retrying"
								: "queued",
		outcome: task.outcome,
		createdAt: task.createdAt.toISOString(),
	};
}
