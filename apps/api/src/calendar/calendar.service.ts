import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { normalizeEmail } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	approvalSnapshotSequenceId,
	outreachExecutionDisabledReason,
	outreachStepStopReason,
} from "../outreach/outreach-read-model";

const OUTREACH_SEQUENCE_APPROVAL_ACTION = "outreach.sequence.approve";

function emailDomain(email: string): string | null {
	const [, domain] = email.split("@");
	return domain || null;
}

@Injectable()
export class CalendarService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async agenda() {
		const now = new Date();
		const from = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1_000);
		const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1_000);
		const [events, tasks, drafts, deals] = await Promise.all([
			this.db.calendarEvent.findMany({
				where: {
					startsAt: { gte: from, lte: to },
					status: { not: "cancelled" },
				},
				orderBy: { startsAt: "asc" },
				take: 250,
				select: {
					id: true,
					title: true,
					startsAt: true,
					endsAt: true,
					isAllDay: true,
					location: true,
					conferenceUrl: true,
					company: { select: { id: true, name: true } },
					contact: {
						select: { id: true, firstName: true, lastName: true },
					},
					_count: { select: { attendees: true } },
				},
			}),
			this.db.activity.findMany({
				where: {
					dueAt: { gte: from, lte: to },
					completedAt: null,
					calendarEventId: null,
				},
				orderBy: { dueAt: "asc" },
				take: 150,
				select: {
					id: true,
					type: true,
					subject: true,
					dueAt: true,
					company: { select: { id: true, name: true } },
					contact: {
						select: { id: true, firstName: true, lastName: true },
					},
					deal: { select: { id: true, name: true } },
				},
			}),
			this.db.emailDraft.findMany({
				where: {
					scheduledFor: { gte: from, lte: to },
					status: {
						in: [
							"DRAFT",
							"PENDING_APPROVAL",
							"APPROVED",
							"SENDING",
							"SENT",
							"REJECTED",
						],
					},
				},
				orderBy: { scheduledFor: "asc" },
				take: 150,
				select: {
					id: true,
					subject: true,
					status: true,
					sequenceId: true,
					sequenceStep: true,
					scheduledFor: true,
					sendError: true,
					approvalDigest: true,
					inbox: {
						select: { isEnabled: true, lastError: true },
					},
					events: {
						where: {
							eventType: { in: ["BOUNCED", "COMPLAINED", "REJECTED"] },
						},
						orderBy: { createdAt: "desc" },
						take: 1,
						select: { eventType: true },
					},
					prospect: {
						select: {
							id: true,
							companyName: true,
							namedPerson: true,
							routeEmail: true,
						},
					},
					company: { select: { id: true, name: true } },
					contact: {
						select: { id: true, firstName: true, lastName: true },
					},
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
			}),
			this.db.deal.findMany({
				where: {
					expectedCloseDate: { gte: from, lte: to },
					stage: { notIn: ["CLOSED_WON", "CLOSED_LOST"] },
				},
				orderBy: { expectedCloseDate: "asc" },
				take: 100,
				select: {
					id: true,
					name: true,
					stage: true,
					expectedCloseDate: true,
					company: { select: { id: true, name: true } },
				},
			}),
		]);
		const sendingPaused =
			process.env.PROVIDER_MUTATIONS_PAUSED?.trim().toLowerCase() !== "false" ||
			process.env.OUTREACH_SENDS_PAUSED?.trim().toLowerCase() !== "false";
		const routeEmails = [
			...new Set(
				drafts
					.map((draft) => normalizeEmail(draft.prospect?.routeEmail ?? ""))
					.filter((email): email is string => email !== null),
			),
		];
		const routeDomains = [
			...new Set(
				routeEmails
					.map((email) => emailDomain(email))
					.filter((domain): domain is string => domain !== null),
			),
		];
		const prospectIds = [
			...new Set(
				drafts
					.map((draft) => draft.prospect?.id)
					.filter((id): id is string => Boolean(id)),
			),
		];
		const [suppressedContacts, suppressedDomains, approvals] =
			await Promise.all([
				routeEmails.length > 0
					? this.db.suppressedContact.findMany({
							where: { email: { in: routeEmails } },
							select: { email: true },
						})
					: [],
				routeDomains.length > 0
					? this.db.suppressedDomain.findMany({
							where: { domain: { in: routeDomains } },
							select: { domain: true },
						})
					: [],
				prospectIds.length > 0
					? this.db.approvalRequest.findMany({
							where: {
								targetType: "PROSPECT",
								targetId: { in: prospectIds },
								action: OUTREACH_SEQUENCE_APPROVAL_ACTION,
							},
							orderBy: { updatedAt: "desc" },
							select: {
								status: true,
								expiresAt: true,
								contentSnapshot: true,
							},
						})
					: [],
			]);
		const suppressedEmailSet = new Set(
			suppressedContacts
				.map((row) => normalizeEmail(row.email))
				.filter((email): email is string => email !== null),
		);
		const suppressedDomainSet = new Set(
			suppressedDomains.map((row) => row.domain),
		);
		const approvalBySequence = new Map<
			string,
			{ status: string; expiresAt: Date }
		>();
		for (const approval of approvals) {
			const sequenceId = approvalSnapshotSequenceId(approval.contentSnapshot);
			if (sequenceId && !approvalBySequence.has(sequenceId)) {
				approvalBySequence.set(sequenceId, {
					status: approval.status,
					expiresAt: approval.expiresAt,
				});
			}
		}

		const items = [
			...events.map((event) => ({
				id: `event:${event.id}`,
				kind: "MEETING" as const,
				title: event.title ?? "Calendar event",
				startsAt: event.startsAt.toISOString(),
				endsAt: event.endsAt.toISOString(),
				isAllDay: event.isAllDay,
				status: "Scheduled",
				company: event.company,
				contact: event.contact,
				deal: null,
				prospect: null,
				location: event.location,
				conferenceUrl: event.conferenceUrl,
				attendeeCount: event._count.attendees,
				stopReason: null,
				executionDisabled: false,
				executionDisabledReason: null,
			})),
			...tasks.flatMap((task) =>
				task.dueAt
					? [
							{
								id: `task:${task.id}`,
								kind: "TASK" as const,
								title: task.subject ?? `${task.type.toLowerCase()} follow-up`,
								startsAt: task.dueAt.toISOString(),
								endsAt: null,
								isAllDay: true,
								status: "Due",
								company: task.company,
								contact: task.contact,
								deal: task.deal,
								prospect: null,
								location: null,
								conferenceUrl: null,
								attendeeCount: null,
								stopReason: null,
								executionDisabled: false,
								executionDisabledReason: null,
							},
						]
					: [],
			),
			...drafts.flatMap((draft) =>
				draft.scheduledFor
					? (() => {
							const routeEmail = normalizeEmail(
								draft.prospect?.routeEmail ?? "",
							);
							const routeDomain = routeEmail ? emailDomain(routeEmail) : null;
							const routeSuppressed = Boolean(
								routeEmail &&
									(suppressedEmailSet.has(routeEmail) ||
										(routeDomain && suppressedDomainSet.has(routeDomain))),
							);
							const approval = draft.sequenceId
								? approvalBySequence.get(draft.sequenceId)
								: null;
							const stopReason = outreachStepStopReason({
								status: draft.status,
								sendError: draft.sendError,
								hasInboundReply: Boolean(draft.thread?.messages.length),
								events: draft.events,
							});
							const executionDisabledReason =
								stopReason ??
								outreachExecutionDisabledReason({
									approvalStatus: approval?.status ?? null,
									approvalExpired: Boolean(
										approval && approval.expiresAt <= now,
									),
									sendingPaused,
									inboxEnabled: draft.inbox.isEnabled,
									inboxError: draft.inbox.lastError,
									routeSuppressed,
									hasApprovalDigest: Boolean(draft.approvalDigest),
								});
							return [
								{
									id: `email:${draft.id}`,
									kind: "OUTREACH" as const,
									title: draft.subject,
									startsAt: draft.scheduledFor.toISOString(),
									endsAt: null,
									isAllDay: false,
									status: `${draft.status.toLowerCase()} · step ${draft.sequenceStep ?? "—"}`,
									company:
										draft.company ??
										(draft.prospect
											? { id: "", name: draft.prospect.companyName }
											: null),
									contact: draft.contact,
									deal: null,
									prospect: draft.prospect,
									location: null,
									conferenceUrl: null,
									attendeeCount: null,
									stopReason,
									executionDisabled: executionDisabledReason !== null,
									executionDisabledReason,
								},
							];
						})()
					: [],
			),
			...deals.flatMap((deal) =>
				deal.expectedCloseDate
					? [
							{
								id: `deal:${deal.id}`,
								kind: "DEAL" as const,
								title: `${deal.name} target close`,
								startsAt: deal.expectedCloseDate.toISOString(),
								endsAt: null,
								isAllDay: true,
								status: deal.stage.toLowerCase().replaceAll("_", " "),
								company: deal.company,
								contact: null,
								deal: { id: deal.id, name: deal.name },
								prospect: null,
								location: null,
								conferenceUrl: null,
								attendeeCount: null,
								stopReason: null,
								executionDisabled: false,
								executionDisabledReason: null,
							},
						]
					: [],
			),
		].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

		return {
			from: from.toISOString(),
			to: to.toISOString(),
			items,
			counts: {
				meetings: events.length,
				tasks: tasks.length,
				outreach: drafts.length,
				deals: deals.length,
			},
		};
	}
}
