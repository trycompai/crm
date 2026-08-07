import { isMicrosoftConfigured, signsInWithMicrosoft } from "@crm/auth";
import { type Db, GoogleSyncStatus } from "@crm/db";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	MICROSOFT_PROVIDER_ID,
	MICROSOFT_SYNC_SOURCES,
	type MicrosoftSyncSource,
	SCOPE_FOR_SOURCE,
} from "./microsoft.constants";

export type SourceStatus = {
	source: MicrosoftSyncSource;
	connected: boolean;
	status: GoogleSyncStatus | null;
	lastSyncedAt: string | null;
	lastError: string | null;
	autoCreate: boolean;
};

export type ConnectionStatus = {
	configured: boolean;
	linked: boolean;
	required: boolean;
	hasRefreshToken: boolean;
	sources: SourceStatus[];
};

@Injectable()
export class MicrosoftConnectionService {
	private readonly logger = new Logger(MicrosoftConnectionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly stamp: ActivityStampService,
	) {}

	async status(userId: string): Promise<ConnectionStatus> {
		await this.onConnected(userId);

		const [granted, rows, hasRefreshToken, accounts] = await Promise.all([
			this.tokens.grantedScopes(userId, MICROSOFT_PROVIDER_ID),
			this.state.listForUser(userId, MICROSOFT_SYNC_SOURCES),
			this.tokens.hasRefreshToken(userId, MICROSOFT_PROVIDER_ID),
			this.tokens.signInAccounts(userId),
		]);

		const bySource = new Map(rows.map((row) => [row.source, row]));

		const sources = MICROSOFT_SYNC_SOURCES.map((source): SourceStatus => {
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
			configured: isMicrosoftConfigured(),
			linked: accounts.some(
				(account) => account.providerId === MICROSOFT_PROVIDER_ID,
			),
			required: signsInWithMicrosoft(accounts),
			hasRefreshToken,
			sources,
		};
	}

	async onConnected(userId: string): Promise<void> {
		const [granted, existing] = await Promise.all([
			this.tokens.grantedScopes(userId, MICROSOFT_PROVIDER_ID),
			this.state.listForUser(userId, MICROSOFT_SYNC_SOURCES),
		]);

		const known = new Set(existing.map((row) => row.source));

		const added: string[] = [];

		for (const source of MICROSOFT_SYNC_SOURCES) {
			if (!granted.has(SCOPE_FOR_SOURCE[source])) continue;
			if (known.has(source)) continue;

			await this.state.ensure(userId, source, { autoCreate: false });

			added.push(source);
		}

		if (added.length > 0) {
			this.logger.log({
				message: "Microsoft connected",
				userId,
				sources: added,
			});
		}
	}

	async reconcileAll(): Promise<void> {
		const accounts = await this.db.account.findMany({
			where: {
				providerId: MICROSOFT_PROVIDER_ID,
				OR: MICROSOFT_SYNC_SOURCES.map((source) => ({
					scope: { contains: SCOPE_FOR_SOURCE[source] },
				})),
			},
			select: { userId: true },
		});

		for (const userId of new Set(accounts.map((row) => row.userId))) {
			await this.onConnected(userId);
		}
	}

	async purgeSyncedData(userId: string): Promise<{ purged: number }> {
		const threads = await this.db.emailThread.deleteMany({
			where: {
				messages: {
					some: { syncedByUserId: userId, outlookMessageId: { not: null } },
				},
			},
		});

		await this.stamp.recomputeAll();

		this.logger.log({
			message: "Outlook data purged",
			userId,
			purged: threads.count,
		});

		return { purged: threads.count };
	}

	async revoke(userId: string): Promise<{ revoked: boolean }> {
		for (const source of MICROSOFT_SYNC_SOURCES) {
			await this.state.remove(userId, source);
		}

		const revoked = await this.tokens.revoke(userId, MICROSOFT_PROVIDER_ID);
		return { revoked };
	}

	async setAutoCreate(
		userId: string,
		source: MicrosoftSyncSource,
		enabled: boolean,
	): Promise<void> {
		const row = await this.state.get(userId, source);
		if (!row) {
			throw new NotFoundException(`${source} is not connected.`);
		}

		await this.state.setAutoCreate(userId, source, enabled);
	}
}
