import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	ActivityType,
	db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import type {
	CalendarClient,
	EventsPage,
	GoogleEvent,
} from "../src/google/calendar.client";
import { CalendarSyncService } from "../src/google/calendar-sync.service";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "calendar-sync-spec";
const domain = `cal-${suffix}.test`;
const userId = `user-cal-${suffix}`;
const mailbox = `rep-cal-${suffix}@example.test`;
const person = `buyer@${domain}`;
const iCalUid = `uid-${suffix}@google.com`;
const startsAt = "2026-09-01T15:00:00.000Z";
const endsAt = "2026-09-01T16:00:00.000Z";

const agent = {
	contactCreated: async () => undefined,
	companyCreated: async () => undefined,
	meetingSoon: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => undefined,
} as unknown as AgentTriggerService;

const stamp = new ActivityStampService(db);
const directory = new CompanyDirectoryService(agent);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(db, directory, agent, log);
const state = new SyncStateService(db);

let row: MailboxSync;
let companyId: string;
let contactId: string;
let pages: EventsPage[] = [];
let listCalls = 0;

const tokens = {
	async accessTokenFor() {
		return { outcome: "ok" as const, accessToken: "token" };
	},
} as unknown as MailboxTokenService;

const calendar = {
	async listEvents() {
		listCalls += 1;
		const page = pages.shift() ?? { items: [] };
		return { outcome: "ok" as const, data: page };
	},
} as unknown as CalendarClient;

const service = new CalendarSyncService(
	db,
	calendar,
	tokens,
	match,
	state,
	stamp,
	agent,
);

function event(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
	return {
		id: `gcal-${suffix}`,
		iCalUID: iCalUid,
		status: "confirmed",
		summary: "Pricing review",
		location: "Zoom",
		start: { dateTime: startsAt },
		end: { dateTime: endsAt },
		organizer: { email: person, displayName: "A Buyer" },
		attendees: [
			{
				email: person,
				displayName: "A Buyer",
				responseStatus: "accepted",
				organizer: true,
			},
			{
				email: mailbox,
				displayName: "Test Rep",
				responseStatus: "accepted",
				self: true,
			},
		],
		...overrides,
	};
}

async function clean() {
	await db.activity.deleteMany({
		where: {
			OR: [
				{ createdById: userId },
				{ calendarEvent: { iCalUid } },
				{ calendarEvent: { iCalUid: `${iCalUid}-other` } },
			],
		},
	});
	await db.calendarAttendee.deleteMany({
		where: {
			event: {
				OR: [{ iCalUid }, { iCalUid: `${iCalUid}-other` }, { syncedByUserId: userId }],
			},
		},
	});
	await db.calendarEvent.deleteMany({
		where: {
			OR: [{ iCalUid }, { iCalUid: `${iCalUid}-other` }, { syncedByUserId: userId }],
		},
	});
	await db.contact.deleteMany({ where: { email: person } });
	await db.company.deleteMany({ where: { domain } });
	await db.mailboxSync.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: { id: userId, name: "Test Rep", email: mailbox },
	});
	row = await db.mailboxSync.create({
		data: {
			userId,
			source: "calendar",
			autoCreate: false,
			status: GoogleSyncStatus.IDLE,
		},
	});

	const company = await db.company.create({
		data: { name: "Buyer Co", domain },
		select: { id: true },
	});
	companyId = company.id;

	const contact = await db.contact.create({
		data: {
			firstName: "A",
			lastName: "Buyer",
			email: person,
			companyId,
		},
		select: { id: true },
	});
	contactId = contact.id;
});

afterAll(clean);

describe("CalendarSyncService", () => {
	it("projects a relevant meeting onto the company timeline", async () => {
		pages = [{ items: [event()], nextSyncToken: "sync-1" }];
		listCalls = 0;

		const outcome = await service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.eventsWritten).toBe(1);

		const stored = await db.calendarEvent.findUnique({
			where: {
				iCalUid_originalStartTime: {
					iCalUid,
					originalStartTime: new Date(startsAt),
				},
			},
			include: {
				activity: true,
				attendees: { orderBy: { email: "asc" } },
			},
		});

		expect(stored).not.toBeNull();
		expect(stored?.companyId).toBe(companyId);
		expect(stored?.contactId).toBe(contactId);
		expect(stored?.activity?.type).toBe(ActivityType.MEETING);
		expect(stored?.activity?.subject).toBe("Pricing review");
		expect(stored?.activity?.companyId).toBe(companyId);
		expect(stored?.activity?.occurredAt?.toISOString()).toBe(startsAt);
		expect(stored?.attendees.map((a) => a.email)).toEqual(
			[mailbox, person].sort(),
		);

		const refreshed = await db.mailboxSync.findUniqueOrThrow({
			where: { id: row.id },
		});
		expect(refreshed.cursor).toBe("sync-1");
		row = refreshed;
	});

	it("dedupes on (iCalUID, originalStartTime) when the same window re-runs", async () => {
		pages = [
			{
				items: [
					event({ summary: "Pricing review (updated)", location: "HQ" }),
				],
				nextSyncToken: "sync-2",
			},
		];

		const before = await db.calendarEvent.count({ where: { iCalUid } });
		const outcome = await service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.eventsWritten).toBe(1);

		const after = await db.calendarEvent.count({ where: { iCalUid } });
		expect(after).toBe(before);
		expect(after).toBe(1);

		const stored = await db.calendarEvent.findFirst({
			where: { iCalUid },
			include: { activity: true },
		});
		expect(stored?.title).toBe("Pricing review (updated)");
		expect(stored?.location).toBe("HQ");
		expect(stored?.activity?.subject).toBe("Pricing review (updated)");
		expect(stored?.activity?.body).toBe("Location: HQ");

		row = await db.mailboxSync.findUniqueOrThrow({ where: { id: row.id } });
	});

	it("ignores events with no tracked company or contact", async () => {
		const strangerUid = `${iCalUid}-other`;
		pages = [
			{
				items: [
					event({
						iCalUID: strangerUid,
						id: `gcal-stranger-${suffix}`,
						organizer: {
							email: "stranger@unknown-host.invalid",
							displayName: "Nobody",
						},
						attendees: [
							{
								email: "stranger@unknown-host.invalid",
								responseStatus: "accepted",
								organizer: true,
							},
							{
								email: mailbox,
								responseStatus: "accepted",
								self: true,
							},
						],
					}),
				],
				nextSyncToken: "sync-3",
			},
		];

		const before = await db.calendarEvent.count();
		const outcome = await service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.eventsWritten ?? 0).toBe(0);
		expect(await db.calendarEvent.count()).toBe(before);
		expect(
			await db.calendarEvent.count({ where: { iCalUid: strangerUid } }),
		).toBe(0);

		row = await db.mailboxSync.findUniqueOrThrow({ where: { id: row.id } });
	});

	it("removes the projected activity when the event is cancelled", async () => {
		pages = [
			{
				items: [event({ status: "cancelled" })],
				nextSyncToken: "sync-4",
			},
		];

		const outcome = await service.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.eventsRemoved).toBe(1);
		expect(await db.calendarEvent.count({ where: { iCalUid } })).toBe(0);
		expect(
			await db.activity.count({
				where: {
					type: ActivityType.MEETING,
					createdById: userId,
					subject: { contains: "Pricing" },
				},
			}),
		).toBe(0);
	});

	it("clears the cursor on 410 so the next tick re-reads from now", async () => {
		await db.mailboxSync.update({
			where: { id: row.id },
			data: { cursor: "stale-token", status: GoogleSyncStatus.IDLE },
		});
		row = await db.mailboxSync.findUniqueOrThrow({ where: { id: row.id } });

		const failingCalendar = {
			async listEvents() {
				return {
					outcome: "cursor-invalid" as const,
					reason: "Sync token is no longer valid.",
				};
			},
		} as unknown as CalendarClient;

		const failing = new CalendarSyncService(
			db,
			failingCalendar,
			tokens,
			match,
			state,
			stamp,
			agent,
		);

		const outcome = await failing.sync(row);

		expect(outcome.status).toBe("synced");
		expect(outcome.reason).toContain("Cursor reset");

		const refreshed = await db.mailboxSync.findUniqueOrThrow({
			where: { id: row.id },
		});
		expect(refreshed.cursor).toBeNull();
		expect(refreshed.status).toBe(GoogleSyncStatus.IDLE);
		row = refreshed;
	});
});
