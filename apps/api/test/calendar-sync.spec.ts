import { describe, expect, it } from "bun:test";
import type { Db, MailboxSyncModel as MailboxSync } from "@crm/db";
import type {
	CalendarClient,
	GoogleEvent,
} from "../src/google/calendar.client";
import { CalendarSyncService } from "../src/google/calendar-sync.service";
import type { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import type { SyncStateService } from "../src/mailbox/sync-state.service";

const ok = <T>(data: T) => ({ outcome: "ok" as const, data });

const baseEvent: GoogleEvent = {
	id: "google-event-1",
	iCalUID: "shared-event@example.test",
	summary: "Demo",
	start: { dateTime: "2026-08-12T10:00:00.000Z" },
	end: { dateTime: "2026-08-12T10:30:00.000Z" },
	attendees: [{ email: "buyer@example.test", displayName: "Buyer" }],
};

function row(userId: string): MailboxSync {
	return {
		id: `sync-${userId}`,
		userId,
		source: "calendar",
		cursor: null,
		autoCreate: true,
	} as unknown as MailboxSync;
}

function harness(events: GoogleEvent[]) {
	const upserts: unknown[] = [];
	const deletes: unknown[] = [];

	const calendar = {
		async listEvents() {
			return ok({ items: events, nextSyncToken: "next-sync" });
		},
	} as unknown as CalendarClient;

	const tokens = {
		async accessTokenFor() {
			return { outcome: "ok" as const, accessToken: "token" };
		},
	} as unknown as MailboxTokenService;

	const match = {
		async internalIdentity() {
			return {
				addresses: new Set(["rep@trycomp.ai"]),
				domains: new Set(["trycomp.ai"]),
			};
		},
		async suppressedDomains() {
			return new Set<string>();
		},
		async suppressedEmails() {
			return new Set<string>();
		},
		async resolve() {
			return { companyId: "company-1", contactId: null, external: [] };
		},
	} as unknown as MailboxMatchService;

	const state = {
		async markRunning() {},
		async settle() {},
	} as unknown as SyncStateService;

	const db = {
		calendarEvent: {
			async upsert(args: unknown) {
				upserts.push(args);
				return { id: `calendar-${upserts.length}` };
			},
			async deleteMany(args: unknown) {
				deletes.push(args);
				return { count: 1 };
			},
		},
		contact: {
			async findMany() {
				return [];
			},
		},
		calendarAttendee: {
			async upsert() {},
			async findMany() {
				return [];
			},
		},
		activity: {
			async upsert() {
				return { createdAt: new Date("2026-08-12T10:00:00.000Z") };
			},
		},
	} as unknown as Db;

	const stamp = { async touch() {} };
	const agent = { async meetingSoon() {} };

	return {
		service: new CalendarSyncService(
			db,
			calendar,
			tokens,
			match,
			state,
			stamp as never,
			agent as never,
		),
		upserts,
		deletes,
	};
}

describe("CalendarSyncService", () => {
	it("scopes Google event upserts to the syncing user", async () => {
		const first = harness([baseEvent]);
		const second = harness([baseEvent]);

		await first.service.sync(row("u1"));
		await second.service.sync(row("u2"));

		expect(JSON.stringify(first.upserts[0])).toContain('"syncedByUserId":"u1"');
		expect(JSON.stringify(second.upserts[0])).toContain(
			'"syncedByUserId":"u2"',
		);
	});

	it("scopes Google event cancellation to the syncing user", async () => {
		const kit = harness([{ ...baseEvent, status: "cancelled" }]);

		await kit.service.sync(row("u1"));

		expect(JSON.stringify(kit.deletes[0])).toContain('"syncedByUserId":"u1"');
	});
});
