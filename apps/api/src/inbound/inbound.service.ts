import { type Db, EmailProvider } from "@crm/db";
import { MAX_ATTEMPTS } from "@crm/db/agent-tasks";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { InjectDatabase } from "../database/database.constants";
import type {
	GranolaExcludeInput,
	GranolaMatchInput,
} from "./inbound.contracts";

@Injectable()
export class InboundService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async status() {
		const [
			websiteTotal,
			websiteTests,
			latestEnquiry,
			inbox,
			messages,
			granolaNotes,
			granolaMatched,
			latestGranola,
			tasks,
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
			this.db.agentTask.findMany({
				where: {
					kind: {
						in: ["website-intake-sync", "agentmail-sync", "granola-sync"],
					},
				},
				orderBy: { createdAt: "desc" },
				take: 12,
				select: {
					kind: true,
					attempts: true,
					startedAt: true,
					leasedUntil: true,
					finishedAt: true,
					outcome: true,
					createdAt: true,
				},
			}),
		]);

		const websiteTask = latestTask(tasks, "website-intake-sync");
		const agentMailTask = latestTask(tasks, "agentmail-sync");
		const granolaTask = latestTask(tasks, "granola-sync");
		const websiteConfigured = configuredFrom(websiteTask, websiteTotal > 0);
		const agentMailConfigured = configuredFrom(agentMailTask, inbox !== null);
		const granolaConfigured = configuredFrom(granolaTask, granolaNotes > 0);
		const outboundEnabled = Boolean(agentMailConfigured && inbox?.isEnabled);

		return {
			website: {
				configured: websiteConfigured,
				total: websiteTotal,
				live: websiteTotal - websiteTests,
				tests: websiteTests,
				latestSourceAt: latestEnquiry?.createdAtSource.toISOString() ?? null,
				lastImportedAt: latestEnquiry?.importedAt.toISOString() ?? null,
				task: websiteTask,
			},
			agentMail: {
				configured: agentMailConfigured,
				outboundEnabled,
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
				task: granolaTask,
			},
			outboundEnabled,
		};
	}

	async syncNow() {
		const result = await this.agent.syncInbound();
		return { ...result, status: await this.status() };
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

function configuredFrom(
	task: ReturnType<typeof latestTask>,
	hasImportedState: boolean,
): boolean {
	if (!task) return hasImportedState;
	return !/not configured|missing .*key|access is unavailable/i.test(
		task.outcome ?? "",
	);
}

function latestTask(
	tasks: {
		kind: string;
		attempts: number;
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
	const failed =
		task.finishedAt &&
		(task.attempts >= MAX_ATTEMPTS || task.outcome?.startsWith("Gave up"));
	const running =
		!task.finishedAt &&
		task.startedAt &&
		task.leasedUntil &&
		task.leasedUntil > new Date();
	return {
		state: failed
			? "failed"
			: task.finishedAt
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
