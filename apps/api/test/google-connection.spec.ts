import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import { ForbiddenException } from "@nestjs/common";
import type { ActivityStampService } from "../src/crm/activity-stamp.service";
import { GoogleConnectionService } from "../src/google/google-connection.service";
import type { GoogleMatchService } from "../src/google/google-match.service";
import type { GoogleTokenService } from "../src/google/google-token.service";
import type { SyncStateService } from "../src/google/sync-state.service";

function connection(role: string | null): {
	service: GoogleConnectionService;
	deleted: { threads: number; events: number };
} {
	const deleted = { threads: 0, events: 0 };
	const db = {
		member: {
			findUnique: async () => (role === null ? null : { role }),
		},
		suppressedDomain: {
			upsert: async () => ({ domain: "globex.com" }),
		},
		company: {
			findUnique: async () => ({ id: "company-1" }),
		},
		$transaction: async (ops: unknown) => {
			const list = (await Promise.all(
				ops as Array<Promise<{ count: number }>>,
			)) as Array<{ count: number }>;
			const threads = list[0]?.count ?? 0;
			const events = list[1]?.count ?? 0;
			deleted.threads = threads;
			deleted.events = events;
			return [{ count: threads }, { count: events }];
		},
		emailThread: {
			deleteMany: async () => ({ count: 2 }),
		},
		calendarEvent: {
			deleteMany: async () => ({ count: 1 }),
		},
	} as unknown as Db;

	const service = new GoogleConnectionService(
		db,
		{} as unknown as GoogleTokenService,
		{} as unknown as SyncStateService,
		{
			internalIdentity: async () => ({
				domains: new Set(["acme.com"]),
				addresses: new Set<string>(),
			}),
		} as unknown as GoogleMatchService,
		{
			recomputeAll: async () => undefined,
		} as unknown as ActivityStampService,
	);

	return { service, deleted };
}

describe("suppressDomain", () => {
	it("refuses a member", async () => {
		const { service } = connection("member");
		await expect(
			service.suppressDomain("u1", "globex.com", { purge: true }),
		).rejects.toThrow(ForbiddenException);
	});

	it("refuses someone with no workspace membership", async () => {
		const { service } = connection(null);
		await expect(
			service.suppressDomain("u1", "globex.com", { purge: true }),
		).rejects.toThrow(ForbiddenException);
	});

	it("lets an admin suppress without purging", async () => {
		const { service } = connection("admin");
		const result = await service.suppressDomain("u1", "globex.com", {
			purge: false,
		});
		expect(result).toEqual({ domain: "globex.com", purged: 0 });
	});

	it("lets an owner suppress and purge", async () => {
		const { service, deleted } = connection("owner");
		const result = await service.suppressDomain("u1", "globex.com", {
			purge: true,
		});
		expect(result).toEqual({ domain: "globex.com", purged: 3 });
		expect(deleted.threads).toBe(2);
		expect(deleted.events).toBe(1);
	});
});
