import { isGoogleConfigured, signsInWithGoogle } from "@crm/auth";
import { type Db, GoogleSyncStatus } from "@crm/db";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { normalizeDomain } from "../companies/domain";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { InjectDatabase } from "../database/database.constants";
import { MailboxMatchService } from "../mailbox/mailbox-match.service";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	GOOGLE_PROVIDER_ID,
	GOOGLE_SYNC_SOURCES,
	type GoogleSyncSource,
	SCOPE_FOR_SOURCE,
} from "./google.constants";

export type SourceStatus = {
	source: GoogleSyncSource;
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
export class GoogleConnectionService {
	private readonly logger = new Logger(GoogleConnectionService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly state: SyncStateService,
		private readonly match: MailboxMatchService,
		private readonly stamp: ActivityStampService,
	) {}

	async status(userId: string): Promise<ConnectionStatus> {
		await this.onConnected(userId);

		const [granted, rows, hasRefreshToken, accounts] = await Promise.all([
			this.tokens.grantedScopes(userId, GOOGLE_PROVIDER_ID),
			this.state.listForUser(userId, GOOGLE_SYNC_SOURCES),
			this.tokens.hasRefreshToken(userId, GOOGLE_PROVIDER_ID),
			this.tokens.signInAccounts(userId),
		]);

		const bySource = new Map(rows.map((row) => [row.source, row]));

		const sources = GOOGLE_SYNC_SOURCES.map((source): SourceStatus => {
			const row = bySource.get(source);
			const connected = granted.has(SCOPE_FOR_SOURCE[source]);

			return {
				source,
				connected,
				status: row?.status ?? null,
				lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
				lastError: row?.lastError ?? null,
				autoCreate: row?.autoCreate ?? false,
			};
		});

		return {
			configured: isGoogleConfigured(),
			linked: accounts.some(
				(account) => account.providerId === GOOGLE_PROVIDER_ID,
			),
			required: signsInWithGoogle(accounts),
			hasRefreshToken,
			sources,
		};
	}

	async onConnected(userId: string): Promise<void> {
		const [granted, existing] = await Promise.all([
			this.tokens.grantedScopes(userId, GOOGLE_PROVIDER_ID),
			this.state.listForUser(userId, GOOGLE_SYNC_SOURCES),
		]);

		const known = new Set(existing.map((row) => row.source));

		const added: string[] = [];

		for (const source of GOOGLE_SYNC_SOURCES) {
			if (!granted.has(SCOPE_FOR_SOURCE[source])) continue;
			if (known.has(source)) continue;

			await this.state.ensure(userId, source, {
				autoCreate: source === "calendar",
			});

			added.push(source);
		}

		if (added.length > 0) {
			this.logger.log({ message: "Google connected", userId, sources: added });
		}
	}

	async reconcileAll(): Promise<void> {
		const accounts = await this.db.account.findMany({
			where: {
				providerId: GOOGLE_PROVIDER_ID,
				OR: GOOGLE_SYNC_SOURCES.map((source) => ({
					scope: { contains: SCOPE_FOR_SOURCE[source] },
				})),
			},
			select: { userId: true },
		});

		for (const account of new Set(accounts.map((row) => row.userId))) {
			await this.onConnected(account);
		}
	}

	async purgeSyncedData(userId: string): Promise<{ purged: number }> {
		const [threads, events] = await this.db.$transaction([
			this.db.emailThread.deleteMany({
				where: {
					messages: {
						some: { syncedByUserId: userId, gmailMessageId: { not: null } },
					},
				},
			}),
			this.db.calendarEvent.deleteMany({ where: { syncedByUserId: userId } }),
		]);

		await this.stamp.recomputeAll();

		const purged = threads.count + events.count;

		this.logger.log({ message: "Google data purged", userId, purged });

		return { purged };
	}

	async revoke(userId: string): Promise<{ revoked: boolean }> {
		for (const source of GOOGLE_SYNC_SOURCES) {
			await this.state.remove(userId, source);
		}

		const revoked = await this.tokens.revoke(userId, GOOGLE_PROVIDER_ID);
		return { revoked };
	}

	async setAutoCreate(
		userId: string,
		source: GoogleSyncSource,
		enabled: boolean,
	): Promise<void> {
		const row = await this.state.get(userId, source);
		if (!row) {
			throw new NotFoundException(`${source} is not connected.`);
		}

		await this.state.setAutoCreate(userId, source, enabled);
	}

	async suppressDomain(
		domain: string,
		options: { reason?: string; purge: boolean },
	): Promise<{ domain: string; purged: number }> {
		const normalised = normalizeDomain(domain);
		if (!normalised) {
			throw new NotFoundException(`"${domain}" is not a domain.`);
		}

		const ours = await this.match.internalIdentity();
		if (ours.domains.has(normalised)) {
			throw new NotFoundException(
				"That is our own domain — it is already excluded.",
			);
		}

		await this.db.suppressedDomain.upsert({
			where: { domain: normalised },
			create: { domain: normalised, reason: options.reason ?? null },
			update: { reason: options.reason ?? null },
		});

		if (!options.purge) return { domain: normalised, purged: 0 };

		const company = await this.db.company.findUnique({
			where: { domain: normalised },
			select: { id: true },
		});

		if (!company) return { domain: normalised, purged: 0 };

		const [threads, events] = await this.db.$transaction([
			this.db.emailThread.deleteMany({ where: { companyId: company.id } }),
			this.db.calendarEvent.deleteMany({ where: { companyId: company.id } }),
		]);

		await this.stamp.recomputeAll();

		this.logger.log({
			message: "Domain suppressed",
			domain: normalised,
			purged: threads.count + events.count,
		});

		return { domain: normalised, purged: threads.count + events.count };
	}
}
