import { ActivityType, db, EmailDirection } from "@crm/db";
import { isDerivedName } from "./names";

const BODY_LIMIT = 4000;

export type AccountThread = {
	subject: string | null;
	contact: { id: string; name: string } | null;
	messageCount: number;
	lastMessageAt: string;
	messages: {
		direction: string;
		from: string;
		fromName: string | null;
		sentAt: string;
		body: string | null;
	}[];
};

export type AccountMeeting = {
	title: string | null;
	startsAt: string;
	upcoming: boolean;
	attendees: { email: string; name: string | null }[];
};

export type AccountNote = {
	type: string;
	subject: string | null;
	body: string | null;
	occurredAt: string;
};

export type CompanyPerson = {
	id: string;
	name: string;
	title: string | null;
	email: string | null;
	linkedinUrl: string | null;
	lastActivityAt: string | null;
	threads: number;
	meetings: number;
	needsIdentity: boolean;
};

export type CompanyDeal = {
	id: string;
	name: string;
	stage: string;
	open: boolean;
	amount: number | null;
	currency: string;
	expectedCloseDate: string | null;
	lastActivityAt: string | null;
	contacts: { id: string; name: string; role: string | null }[];
};

export type CompanyHistory = {
	company: {
		id: string;
		name: string;
		domain: string | null;
		website: string | null;
		industry: string | null;
		location: string | null;
		description: string | null;
		linkedinUrl: string | null;
		enrichmentStatus: string;
	};
	people: CompanyPerson[];
	deals: CompanyDeal[];
	threads: AccountThread[];
	meetings: AccountMeeting[];
	notes: AccountNote[];
	stats: {
		people: number;
		openDeals: number;
		emails: number;
		meetings: number;
		theyReplied: boolean;
		lastReplyAt: string | null;
		lastReplyFrom: string | null;
		nextMeetingAt: string | null;
	};
};

export async function readCompanyHistory(
	companyId: string,
	options: {
		threads?: number;
		messagesPerThread?: number;
		people?: number;
		includeEmail?: boolean;
		includeCalendar?: boolean;
	} = {},
): Promise<CompanyHistory | null> {
	const company = await db.company.findUnique({
		where: { id: companyId },
		select: {
			id: true,
			name: true,
			domain: true,
			website: true,
			industry: true,
			subIndustry: true,
			city: true,
			country: true,
			description: true,
			linkedinUrl: true,
			enrichmentStatus: true,
		},
	});

	if (!company) return null;
	const includeEmail = options.includeEmail ?? true;
	const includeCalendar = options.includeCalendar ?? true;

	const belongsToCompany = { OR: [{ companyId }, { contact: { companyId } }] };

	const [people, deals, threads, meetings, notes, lastInbound, counts] =
		await Promise.all([
			db.contact.findMany({
				where: { companyId },
				orderBy: [{ lastActivityAt: "desc" }, { createdAt: "asc" }],
				take: options.people ?? 25,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					title: true,
					email: true,
					linkedinUrl: true,
					lastActivityAt: true,
					_count:
						includeEmail || includeCalendar
							? {
									select: {
										emailThreads: includeEmail,
										calendarEvents: includeCalendar,
									},
								}
							: false,
				},
			}),
			db.deal.findMany({
				where: { companyId },
				orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
				take: 20,
				select: {
					id: true,
					name: true,
					stage: true,
					amount: true,
					currency: true,
					expectedCloseDate: true,
					lastActivityAt: true,
					contacts: {
						select: {
							role: true,
							contact: {
								select: { id: true, firstName: true, lastName: true },
							},
						},
					},
				},
			}),
			includeEmail
				? db.emailThread.findMany({
						where: belongsToCompany,
						orderBy: { lastMessageAt: "desc" },
						take: options.threads ?? 5,
						select: {
							subject: true,
							messageCount: true,
							lastMessageAt: true,
							contact: {
								select: { id: true, firstName: true, lastName: true },
							},
							messages: {
								orderBy: { sentAt: "desc" },
								take: options.messagesPerThread ?? 4,
								select: {
									direction: true,
									fromEmail: true,
									fromName: true,
									sentAt: true,
									body: true,
									snippet: true,
								},
							},
						},
					})
				: Promise.resolve([]),
			includeCalendar
				? db.calendarEvent.findMany({
						where: {
							OR: [
								{ companyId },
								{ contact: { companyId } },
								{ attendees: { some: { contact: { companyId } } } },
							],
						},
						orderBy: { startsAt: "desc" },
						take: 10,
						select: {
							title: true,
							startsAt: true,
							attendees: { select: { email: true, name: true } },
						},
					})
				: Promise.resolve([]),
			recentNotes({ companyId }),
			includeEmail
				? db.emailMessage.findFirst({
						where: {
							direction: EmailDirection.INBOUND,
							thread: belongsToCompany,
						},
						orderBy: { sentAt: "desc" },
						select: { sentAt: true, fromEmail: true, fromName: true },
					})
				: Promise.resolve(null),
			Promise.all([
				db.contact.count({ where: { companyId } }),
				includeEmail
					? db.emailMessage.count({ where: { thread: belongsToCompany } })
					: Promise.resolve(0),
				includeCalendar
					? db.calendarEvent.count({
							where: {
								OR: [{ companyId }, { contact: { companyId } }],
							},
						})
					: Promise.resolve(0),
			]),
		]);

	const [peopleCount, emailCount, meetingCount] = counts;
	const now = new Date();

	return {
		company: {
			id: company.id,
			name: company.name,
			domain: company.domain,
			website: company.website,
			industry: [company.industry, company.subIndustry]
				.filter(Boolean)
				.join(" / "),
			location: [company.city, company.country].filter(Boolean).join(", "),
			description: company.description,
			linkedinUrl: company.linkedinUrl,
			enrichmentStatus: company.enrichmentStatus,
		},
		people: people.map((person) => ({
			id: person.id,
			name: fullName(person),
			title: person.title,
			email: person.email,
			linkedinUrl: person.linkedinUrl,
			lastActivityAt: person.lastActivityAt?.toISOString() ?? null,
			threads: person._count?.emailThreads ?? 0,
			meetings: person._count?.calendarEvents ?? 0,
			needsIdentity: isDerivedName(
				person.email,
				person.firstName,
				person.lastName,
			),
		})),
		deals: deals.map(toCompanyDeal),
		threads: threads.map(toAccountThread),
		meetings: meetings.map((meeting) => toAccountMeeting(meeting, now)),
		notes,
		stats: {
			people: peopleCount,
			openDeals: deals.filter((deal) => isOpen(deal.stage)).length,
			emails: emailCount,
			meetings: meetingCount,
			theyReplied: lastInbound !== null,
			lastReplyAt: lastInbound?.sentAt.toISOString() ?? null,
			lastReplyFrom: lastInbound
				? (lastInbound.fromName ?? lastInbound.fromEmail)
				: null,
			nextMeetingAt:
				meetings
					.filter((meeting) => meeting.startsAt > now)
					.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]
					?.startsAt.toISOString() ?? null,
		},
	};
}

export type DealHistory = {
	deal: {
		id: string;
		name: string;
		description: string | null;
		stage: string;
		open: boolean;
		daysInStage: number;
		stageChangedAt: string;
		amount: number | null;
		currency: string;
		expectedCloseDate: string | null;
		closedAt: string | null;
		closedReason: string | null;
		owner: string | null;
		createdAt: string;
	};
	company: { id: string; name: string; domain: string | null };
	people: {
		id: string;
		name: string;
		title: string | null;
		email: string | null;
		role: string | null;
	}[];
	stageHistory: { from: string | null; to: string | null; at: string }[];
	threads: AccountThread[];
	meetings: AccountMeeting[];
	notes: AccountNote[];
	stats: {
		theyReplied: boolean;
		lastReplyAt: string | null;
		lastReplyFrom: string | null;
		nextMeetingAt: string | null;
		daysSinceLastActivity: number | null;
	};
	note: string;
};

export async function readDealHistory(
	dealId: string,
	options: {
		threads?: number;
		messagesPerThread?: number;
		includeEmail?: boolean;
		includeCalendar?: boolean;
	} = {},
): Promise<DealHistory | null> {
	const deal = await db.deal.findUnique({
		where: { id: dealId },
		select: {
			id: true,
			name: true,
			description: true,
			stage: true,
			stageChangedAt: true,
			amount: true,
			currency: true,
			expectedCloseDate: true,
			closedAt: true,
			closedReason: true,
			lastActivityAt: true,
			createdAt: true,
			owner: { select: { name: true, email: true } },
			company: { select: { id: true, name: true, domain: true } },
			contacts: {
				select: {
					role: true,
					contact: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							title: true,
							email: true,
						},
					},
				},
			},
		},
	});

	if (!deal) return null;
	const includeEmail = options.includeEmail ?? true;
	const includeCalendar = options.includeCalendar ?? true;

	const contactIds = deal.contacts.map(({ contact }) => contact.id);

	const relatedThreads =
		contactIds.length > 0
			? {
					OR: [
						{ contactId: { in: contactIds } },
						{ companyId: deal.company.id },
					],
				}
			: { companyId: deal.company.id };

	const [stageChanges, threads, meetings, notes, lastInbound] =
		await Promise.all([
			db.activity.findMany({
				where: { dealId, type: ActivityType.STAGE_CHANGE },
				orderBy: { createdAt: "asc" },
				take: 25,
				select: { meta: true, createdAt: true },
			}),
			includeEmail
				? db.emailThread.findMany({
						where: relatedThreads,
						orderBy: { lastMessageAt: "desc" },
						take: options.threads ?? 5,
						select: {
							subject: true,
							messageCount: true,
							lastMessageAt: true,
							contact: {
								select: { id: true, firstName: true, lastName: true },
							},
							messages: {
								orderBy: { sentAt: "desc" },
								take: options.messagesPerThread ?? 4,
								select: {
									direction: true,
									fromEmail: true,
									fromName: true,
									sentAt: true,
									body: true,
									snippet: true,
								},
							},
						},
					})
				: Promise.resolve([]),
			includeCalendar
				? db.calendarEvent.findMany({
						where:
							contactIds.length > 0
								? {
										OR: [
											{ contactId: { in: contactIds } },
											{
												attendees: { some: { contactId: { in: contactIds } } },
											},
											{ companyId: deal.company.id },
										],
									}
								: { companyId: deal.company.id },
						orderBy: { startsAt: "desc" },
						take: 10,
						select: {
							title: true,
							startsAt: true,
							attendees: { select: { email: true, name: true } },
						},
					})
				: Promise.resolve([]),
			recentNotes({ dealId }),
			includeEmail
				? db.emailMessage.findFirst({
						where: {
							direction: EmailDirection.INBOUND,
							thread: relatedThreads,
						},
						orderBy: { sentAt: "desc" },
						select: { sentAt: true, fromEmail: true, fromName: true },
					})
				: Promise.resolve(null),
		]);

	const now = new Date();

	return {
		deal: {
			id: deal.id,
			name: deal.name,
			description: deal.description,
			stage: deal.stage,
			open: isOpen(deal.stage),
			daysInStage: daysSince(deal.stageChangedAt, now),
			stageChangedAt: deal.stageChangedAt.toISOString(),
			amount: deal.amount === null ? null : Number(deal.amount),
			currency: deal.currency,
			expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			closedAt: deal.closedAt?.toISOString() ?? null,
			closedReason: deal.closedReason,
			owner: deal.owner?.name ?? deal.owner?.email ?? null,
			createdAt: deal.createdAt.toISOString(),
		},
		company: deal.company,
		people: deal.contacts.map(({ role, contact }) => ({
			id: contact.id,
			name: fullName(contact),
			title: contact.title,
			email: contact.email,
			role,
		})),
		stageHistory: stageChanges.map((change) => {
			const meta = (change.meta ?? {}) as { from?: unknown; to?: unknown };
			return {
				from: typeof meta.from === "string" ? meta.from : null,
				to: typeof meta.to === "string" ? meta.to : null,
				at: change.createdAt.toISOString(),
			};
		}),
		threads: threads.map(toAccountThread),
		meetings: meetings.map((meeting) => toAccountMeeting(meeting, now)),
		notes,
		stats: {
			theyReplied: lastInbound !== null,
			lastReplyAt: lastInbound?.sentAt.toISOString() ?? null,
			lastReplyFrom: lastInbound
				? (lastInbound.fromName ?? lastInbound.fromEmail)
				: null,
			nextMeetingAt:
				meetings
					.filter((meeting) => meeting.startsAt > now)
					.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]
					?.startsAt.toISOString() ?? null,
			daysSinceLastActivity: deal.lastActivityAt
				? daysSince(deal.lastActivityAt, now)
				: null,
		},
		note:
			includeEmail || includeCalendar
				? contactIds.length > 0
					? "Connected account history is filed against people and companies, never against a deal. The history here belongs to the people on this deal and the rest of the account — read the details before treating any of it as being about this deal."
					: "Nobody is attached to this deal, so the correspondence here is the whole account's. Attaching the people on it would make this answer sharper."
				: "Connected email and calendar history are outside this agent version's approved data sources.",
	};
}

function isOpen(stage: string): boolean {
	return (
		stage !== "CLOSED_WON" &&
		stage !== "CLOSED_LOST" &&
		stage !== "UNQUALIFIED_TO_BUY"
	);
}

async function recentNotes(
	where: { companyId: string } | { dealId: string },
): Promise<AccountNote[]> {
	const rows = await db.activity.findMany({
		where: {
			...where,
			type: {
				in: [
					ActivityType.NOTE,
					ActivityType.CALL,
					ActivityType.TASK,
					ActivityType.ENRICHMENT,
				],
			},
		},
		orderBy: { createdAt: "desc" },
		take: 10,
		select: {
			type: true,
			subject: true,
			body: true,
			occurredAt: true,
			createdAt: true,
		},
	});

	return rows.map((row) => ({
		type: row.type,
		subject: row.subject,
		body: row.body ? row.body.slice(0, BODY_LIMIT) : null,
		occurredAt: (row.occurredAt ?? row.createdAt).toISOString(),
	}));
}

function toAccountThread(thread: {
	subject: string | null;
	messageCount: number;
	lastMessageAt: Date;
	contact: { id: string; firstName: string; lastName: string | null } | null;
	messages: {
		direction: string;
		fromEmail: string;
		fromName: string | null;
		sentAt: Date;
		body: string | null;
		snippet: string | null;
	}[];
}): AccountThread {
	return {
		subject: thread.subject,
		contact: thread.contact
			? { id: thread.contact.id, name: fullName(thread.contact) }
			: null,
		messageCount: thread.messageCount,
		lastMessageAt: thread.lastMessageAt.toISOString(),
		messages: thread.messages.map((message) => ({
			direction: message.direction,
			from: message.fromEmail,
			fromName: message.fromName,
			sentAt: message.sentAt.toISOString(),
			body: (message.body ?? message.snippet)?.slice(0, BODY_LIMIT) ?? null,
		})),
	};
}

function toAccountMeeting(
	meeting: {
		title: string | null;
		startsAt: Date;
		attendees: { email: string; name: string | null }[];
	},
	now: Date,
): AccountMeeting {
	return {
		title: meeting.title,
		startsAt: meeting.startsAt.toISOString(),
		upcoming: meeting.startsAt > now,
		attendees: meeting.attendees,
	};
}

function toCompanyDeal(deal: {
	id: string;
	name: string;
	stage: string;
	amount: unknown;
	currency: string;
	expectedCloseDate: Date | null;
	lastActivityAt: Date | null;
	contacts: {
		role: string | null;
		contact: { id: string; firstName: string; lastName: string | null };
	}[];
}): CompanyDeal {
	return {
		id: deal.id,
		name: deal.name,
		stage: deal.stage,
		open: isOpen(deal.stage),
		amount: deal.amount === null ? null : Number(deal.amount),
		currency: deal.currency,
		expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
		lastActivityAt: deal.lastActivityAt?.toISOString() ?? null,
		contacts: deal.contacts.map(({ role, contact }) => ({
			id: contact.id,
			name: fullName(contact),
			role,
		})),
	};
}

function fullName(person: {
	firstName: string;
	lastName: string | null;
}): string {
	return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

function daysSince(date: Date, now: Date): number {
	return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}
