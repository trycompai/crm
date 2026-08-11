import {
	type Db,
	GoogleSyncStatus,
	type MailboxSyncModel as MailboxSync,
} from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type { SyncSource } from "./mailbox.constants";

export const SYNC_LEASE_MS = 300_000;

export type SyncStateTarget =
	| string
	| Pick<MailboxSync, "id" | "retryAfter" | "updatedAt">;

@Injectable()
export class SyncStateService {
	private readonly logger = new Logger(SyncStateService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async get(userId: string, source: SyncSource): Promise<MailboxSync | null> {
		return this.db.mailboxSync.findUnique({
			where: { userId_source: { userId, source } },
		});
	}

	async listForUser(
		userId: string,
		sources?: readonly SyncSource[],
	): Promise<MailboxSync[]> {
		return this.db.mailboxSync.findMany({
			where: { userId, ...(sources ? { source: { in: [...sources] } } : {}) },
		});
	}

	async due(now: Date): Promise<MailboxSync[]> {
		return this.db.mailboxSync.findMany({
			where: dueWhere(now),
			orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }],
		});
	}

	async claim(row: MailboxSync, now: Date): Promise<boolean> {
		const { count } = await this.db.mailboxSync.updateMany({
			where: { id: row.id, updatedAt: row.updatedAt, ...dueWhere(now) },
			data: {
				status: GoogleSyncStatus.RUNNING,
				retryAfter: new Date(now.getTime() + SYNC_LEASE_MS),
			},
		});

		return count === 1;
	}

	async release(target: SyncStateTarget): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: targetWhere(target),
			data: { retryAfter: null },
		});
	}

	async ensure(
		userId: string,
		source: SyncSource,
		options: { autoCreate: boolean },
	): Promise<MailboxSync> {
		return this.db.mailboxSync.upsert({
			where: { userId_source: { userId, source } },
			create: {
				userId,
				source,
				status: GoogleSyncStatus.IDLE,
				autoCreate: options.autoCreate,
			},
			update: {
				status: GoogleSyncStatus.IDLE,
				lastError: null,
				retryAfter: null,
			},
		});
	}

	async markRunning(target: SyncStateTarget): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: targetWhere(target),
			data: { status: GoogleSyncStatus.RUNNING, lastError: null },
		});
	}

	async settle(
		target: SyncStateTarget,
		update: {
			cursor?: string | null;
			status: GoogleSyncStatus;
		},
	): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: targetWhere(target),
			data: {
				...update,
				lastSyncedAt: new Date(),
				lastError: null,
				retryAfter: null,
			},
		});
	}

	async clearCursor(target: SyncStateTarget, reason: string): Promise<void> {
		this.logger.warn({
			message: "Sync cursor invalidated — resuming from now",
			syncId: typeof target === "string" ? target : target.id,
			reason,
		});

		await this.db.mailboxSync.updateMany({
			where: targetWhere(target),
			data: {
				cursor: null,
				status: GoogleSyncStatus.IDLE,
				lastError: null,
				retryAfter: null,
			},
		});
	}

	async markNeedsReconnect(
		target: SyncStateTarget,
		reason: string,
	): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: targetWhere(target),
			data: {
				status: GoogleSyncStatus.NEEDS_RECONNECT,
				lastError: reason,
				retryAfter: null,
			},
		});
	}

	async markRateLimited(
		target: SyncStateTarget,
		retryAfterMs: number,
	): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: targetWhere(target),
			data: {
				status: GoogleSyncStatus.IDLE,
				retryAfter: new Date(Date.now() + retryAfterMs),
			},
		});
	}

	async markFailed(target: SyncStateTarget, reason: string): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: targetWhere(target),
			data: {
				status: GoogleSyncStatus.FAILED,
				lastError: reason,
				retryAfter: null,
			},
		});
	}

	async setAutoCreate(
		userId: string,
		source: SyncSource,
		enabled: boolean,
	): Promise<void> {
		await this.db.mailboxSync.updateMany({
			where: { userId, source },
			data: { autoCreate: enabled },
		});
	}

	async remove(userId: string, source?: SyncSource): Promise<void> {
		await this.db.mailboxSync.deleteMany({
			where: { userId, ...(source ? { source } : {}) },
		});
	}
}

function dueWhere(now: Date) {
	return {
		status: { notIn: [GoogleSyncStatus.NEEDS_RECONNECT] },
		OR: [{ retryAfter: null }, { retryAfter: { lte: now } }],
	};
}

function targetWhere(target: SyncStateTarget) {
	if (typeof target === "string") return { id: target };

	return {
		id: target.id,
		retryAfter: target.retryAfter,
	};
}
