import { beforeEach, describe, expect, it } from "bun:test";
import {
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import type { GoogleConnectionService } from "../src/google/google-connection.service";
import type { GoogleSyncService } from "../src/google/google-sync.service";
import {
	SYNC_LEASE_MS,
	type SyncStateService,
} from "../src/mailbox/sync-state.service";
import type { MicrosoftConnectionService } from "../src/microsoft/microsoft-connection.service";
import type { MicrosoftSyncService } from "../src/microsoft/microsoft-sync.service";
import { MailboxSyncService } from "../src/sync/mailbox-sync.service";

type Outcome = {
	source: string;
	userId: string;
	status: "synced" | "skipped" | "reconnect" | "rate-limited" | "failed";
};

class FakeState {
	readonly rows = new Map<string, MailboxSync>();
	private revision = 0;

	add(id: string, source: string, overrides: Partial<MailboxSync> = {}): void {
		this.rows.set(id, {
			id,
			userId: `user-${id}`,
			source,
			status: GoogleSyncStatus.IDLE,
			cursor: null,
			lastSyncedAt: null,
			lastError: null,
			retryAfter: null,
			autoCreate: false,
			createdAt: new Date(0),
			updatedAt: this.stamp(),
			...overrides,
		} as MailboxSync);
	}

	async due(now: Date): Promise<MailboxSync[]> {
		return [...this.rows.values()].filter((row) => this.isDue(row, now));
	}

	async claim(row: MailboxSync, now: Date): Promise<boolean> {
		const stored = this.rows.get(row.id);
		if (!stored) return false;
		if (stored.updatedAt.getTime() !== row.updatedAt.getTime()) return false;
		if (!this.isDue(stored, now)) return false;

		this.write(stored, {
			status: GoogleSyncStatus.RUNNING,
			retryAfter: new Date(now.getTime() + SYNC_LEASE_MS),
		});

		return true;
	}

	async release(id: string): Promise<void> {
		const stored = this.rows.get(id);
		if (stored) this.write(stored, { retryAfter: null });
	}

	async settle(id: string): Promise<void> {
		const stored = this.rows.get(id);
		if (stored) {
			this.write(stored, { retryAfter: null, lastSyncedAt: new Date() });
		}
	}

	async markRateLimited(id: string, retryAfterMs: number): Promise<void> {
		const stored = this.rows.get(id);
		if (stored) {
			this.write(stored, {
				status: GoogleSyncStatus.IDLE,
				retryAfter: new Date(Date.now() + retryAfterMs),
			});
		}
	}

	async markFailed(id: string, reason: string): Promise<void> {
		const stored = this.rows.get(id);
		if (stored) {
			this.write(stored, {
				status: GoogleSyncStatus.FAILED,
				lastError: reason,
				retryAfter: null,
			});
		}
	}

	private isDue(row: MailboxSync, now: Date): boolean {
		if (row.status === GoogleSyncStatus.NEEDS_RECONNECT) return false;

		return row.retryAfter === null || row.retryAfter.getTime() <= now.getTime();
	}

	private write(row: MailboxSync, patch: Partial<MailboxSync>): void {
		this.rows.set(row.id, { ...row, ...patch, updatedAt: this.stamp() });
	}

	private stamp(): Date {
		this.revision += 1;
		return new Date(1_700_000_000_000 + this.revision);
	}
}

const noConnections = {
	reconcileAll: async () => undefined,
};

function build(
	state: FakeState,
	runOne: (userId: string, source: string) => Promise<Outcome | null>,
): MailboxSyncService {
	const provider = { runOne } as unknown as GoogleSyncService;

	return new MailboxSyncService(
		state as unknown as SyncStateService,
		provider,
		provider as unknown as MicrosoftSyncService,
		noConnections as unknown as GoogleConnectionService,
		noConnections as unknown as MicrosoftConnectionService,
	);
}

let state: FakeState;

beforeEach(() => {
	state = new FakeState();
});

describe("runDue claims a mailbox before it syncs", () => {
	it("does not let two overlapping ticks run the same mailbox", async () => {
		state.add("a", "gmail");

		const calls: string[] = [];
		let unblock: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			unblock = resolve;
		});

		let inFlight: (() => void) | undefined;
		const held = new Promise<void>((resolve) => {
			inFlight = resolve;
		});

		const service = build(state, async (userId, source) => {
			calls.push(`${userId}:${source}`);
			unblock?.();
			await held;
			return { source, userId, status: "synced" };
		});

		const first = service.runDue();
		await started;

		const second = await service.runDue();

		inFlight?.();
		const firstSummary = await first;

		expect(calls).toEqual(["user-a:gmail"]);
		expect(firstSummary.attempted).toBe(1);
		expect(firstSummary.synced).toBe(1);
		expect(second.attempted).toBe(0);
		expect(second.synced).toBe(0);
	});

	it("leaves the lease in place while the mailbox is running", async () => {
		state.add("a", "outlook");

		let leaseDuringRun: Date | null = null;

		const service = build(state, async (userId, source) => {
			leaseDuringRun = state.rows.get("a")?.retryAfter ?? null;
			return { source, userId, status: "synced" };
		});

		await service.runDue();

		expect(leaseDuringRun).not.toBeNull();
		expect((leaseDuringRun as unknown as Date).getTime()).toBeGreaterThan(
			Date.now(),
		);
	});

	it("skips a row another tick already claimed and does not count it", async () => {
		state.add("a", "gmail", { retryAfter: new Date(Date.now() + 60_000) });

		const service = build(state, async (userId, source) => ({
			source,
			userId,
			status: "synced",
		}));

		expect((await service.runDue()).attempted).toBe(0);
	});
});

describe("runDue always resolves the lease", () => {
	it("releases a not-connected mailbox so the next tick still polls it", async () => {
		state.add("a", "gmail");

		const service = build(state, async (userId, source) => ({
			source,
			userId,
			status: "skipped",
		}));

		const summary = await service.runDue();

		expect(summary.skipped).toBe(1);
		expect(state.rows.get("a")?.retryAfter).toBeNull();
		expect((await state.due(new Date())).map((row) => row.id)).toEqual(["a"]);
	});

	it("releases a mailbox the provider dispatch does not recognise", async () => {
		state.add("a", "pigeon");

		const service = build(state, async () => null);

		const summary = await service.runDue();

		expect(summary.skipped).toBe(1);
		expect(state.rows.get("a")?.retryAfter).toBeNull();
	});

	it("clears the lease when the sync throws", async () => {
		state.add("a", "gmail");

		const service = build(state, async () => {
			throw new Error("boom");
		});

		const summary = await service.runDue();

		expect(summary.failed).toBe(1);
		expect(state.rows.get("a")?.status).toBe(GoogleSyncStatus.FAILED);
		expect(state.rows.get("a")?.retryAfter).toBeNull();
	});
});

describe("runDue counts a rate-limited run honestly", () => {
	it("does not report it as synced", async () => {
		state.add("a", "gmail");

		const service = build(state, async (userId, source) => {
			await state.markRateLimited("a", 30_000);
			return { source, userId, status: "rate-limited" };
		});

		const summary = await service.runDue();

		expect(summary.synced).toBe(0);
		expect(summary.skipped).toBe(0);
		expect(summary.failed).toBe(0);
		expect(summary.rateLimited).toBe(1);
		expect(summary.attempted).toBe(1);
	});

	it("keeps the provider's own retryAfter rather than releasing it", async () => {
		state.add("a", "gmail");

		const service = build(state, async (userId, source) => {
			await state.markRateLimited("a", 30_000);
			return { source, userId, status: "rate-limited" };
		});

		await service.runDue();

		const retryAfter = state.rows.get("a")?.retryAfter;
		expect(retryAfter).not.toBeNull();
		expect((retryAfter as Date).getTime()).toBeGreaterThan(Date.now());
		expect((retryAfter as Date).getTime()).toBeLessThan(
			Date.now() + SYNC_LEASE_MS,
		);
	});
});
