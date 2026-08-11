import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

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
					status: { in: ["APPROVED", "SENDING", "SENT"] },
				},
				orderBy: { scheduledFor: "asc" },
				take: 150,
				select: {
					id: true,
					subject: true,
					status: true,
					sequenceStep: true,
					scheduledFor: true,
					prospect: {
						select: { id: true, companyName: true, namedPerson: true },
					},
					company: { select: { id: true, name: true } },
					contact: {
						select: { id: true, firstName: true, lastName: true },
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
							},
						]
					: [],
			),
			...drafts.flatMap((draft) =>
				draft.scheduledFor
					? [
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
							},
						]
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
