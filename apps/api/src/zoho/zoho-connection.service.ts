import { isZohoConfigured, signsInWithZoho } from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { SyncStateService } from "../mailbox/sync-state.service";
import { rebuildThreads } from "../mailbox/thread-rebuild";
import {
	SCOPE_FOR_SOURCE,
	ZOHO_PROVIDER_ID,
	ZOHO_SYNC_SOURCES,
	type ZohoSyncSource,
} from "./zoho.constants";
import type {
	ZohoConnectionStatus,
	ZohoPurgeSyncedDataOutput,
	ZohoRevokeAccessOutput,
	ZohoSourceStatus,
} from "./zoho.contracts";

const PURGE_TIMEOUT_MS = 60_000;

@Injectable()
export class ZohoConnectionService {
	private readonly logger = new Logger(ZohoConnectionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly stamp: ActivityStampService,
	) {}

	async status(userId: string): Promise<ZohoConnectionStatus> {
		await this.onConnected(userId);

		const [granted, rows, hasRefreshToken, accounts] = await Promise.all([
			this.tokens.grantedScopes(userId, ZOHO_PROVIDER_ID),
			this.state.listForUser(userId, ZOHO_SYNC_SOURCES),
			this.tokens.hasRefreshToken(userId, ZOHO_PROVIDER_ID),
			this.tokens.signInAccounts(userId),
		]);

		const bySource = new Map(rows.map((row) => [row.source, row]));

		const sources = ZOHO_SYNC_SOURCES.map((source): ZohoSourceStatus => {
			const row = bySource.get(source);

			return {
				source,
				connected: granted.has(SCOPE_FOR_SOURCE[source]),
				status: row?.status ?? null,
				lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
				lastError: row?.lastError ?? null,
				autoCreate: row?.autoCreate ?? false,
			};
		});

		return {
			configured: isZohoConfigured(),
			linked:
				accounts.some((account) => account.providerId === ZOHO_PROVIDER_ID) &&
				sources.some((source) => source.connected),
			required: signsInWithZoho(accounts),
			hasRefreshToken,
			sources,
		};
	}

	async onConnected(userId: string): Promise<void> {
		const [granted, existing] = await Promise.all([
			this.tokens.grantedScopes(userId, ZOHO_PROVIDER_ID),
			this.state.listForUser(userId, ZOHO_SYNC_SOURCES),
		]);

		const known = new Set(existing.map((row) => row.source));

		const added: string[] = [];

		for (const source of ZOHO_SYNC_SOURCES) {
			if (!granted.has(SCOPE_FOR_SOURCE[source])) continue;
			if (known.has(source)) continue;

			await this.state.ensure(userId, source, { autoCreate: false });

			added.push(source);
		}

		if (added.length > 0) {
			this.logger.log({ message: "Zoho connected", userId, sources: added });
		}
	}

	async reconcileAll(): Promise<void> {
		const accounts = await this.db.account.findMany({
			where: {
				providerId: ZOHO_PROVIDER_ID,
				OR: ZOHO_SYNC_SOURCES.map((source) => ({
					scope: { contains: SCOPE_FOR_SOURCE[source] },
				})),
			},
			select: { userId: true },
		});

		for (const userId of new Set(accounts.map((row) => row.userId))) {
			await this.onConnected(userId);
		}
	}

	async purgeSyncedData(userId: string): Promise<ZohoPurgeSyncedDataOutput> {
		const mine: Prisma.EmailMessageWhereInput = {
			syncedByUserId: userId,
			zohoMessageId: { not: null },
		};

		const purged = await this.db.$transaction(
			async (tx) => {
				const touched = await tx.emailMessage.findMany({
					where: mine,
					select: { threadId: true },
					distinct: ["threadId"],
				});

				const threadIds = touched.map((row) => row.threadId);
				const messages = await tx.emailMessage.deleteMany({ where: mine });

				await tx.emailThread.deleteMany({
					where: { id: { in: threadIds }, messages: { none: {} } },
				});

				await rebuildThreads(tx, threadIds);

				return messages.count;
			},
			{ timeout: PURGE_TIMEOUT_MS },
		);

		await this.stamp.recomputeAll();

		this.logger.log({ message: "Zoho Mail data purged", userId, purged });

		return { purged };
	}

	async revoke(userId: string): Promise<ZohoRevokeAccessOutput> {
		for (const source of ZOHO_SYNC_SOURCES) {
			await this.state.remove(userId, source);
		}

		const revoked = await this.tokens.revoke(userId, ZOHO_PROVIDER_ID);
		return { revoked };
	}

	async setAutoCreate(
		userId: string,
		source: ZohoSyncSource,
		enabled: boolean,
	): Promise<void> {
		const row = await this.state.get(userId, source);
		if (!row) {
			throw new NotFoundException(`${source} is not connected.`);
		}

		await this.state.setAutoCreate(userId, source, enabled);
	}
}
