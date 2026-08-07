import { syncError } from "@crm/telemetry";
import { Injectable, Logger } from "@nestjs/common";
import { GoogleConnectionService } from "../google/google-connection.service";
import { GoogleSyncService } from "../google/google-sync.service";
import {
	isGoogleSyncSource,
	isMicrosoftSyncSource,
} from "../mailbox/mailbox.constants";
import { SyncStateService } from "../mailbox/sync-state.service";
import { MicrosoftConnectionService } from "../microsoft/microsoft-connection.service";
import { MicrosoftSyncService } from "../microsoft/microsoft-sync.service";

const TICK_BUDGET_MS = 60_000;

export type TickSummary = {
	attempted: number;
	synced: number;
	skipped: number;
	rateLimited: number;
	failed: number;
	durationMs: number;
};

@Injectable()
export class MailboxSyncService {
	private readonly logger = new Logger(MailboxSyncService.name);

	constructor(
		private readonly state: SyncStateService,
		private readonly google: GoogleSyncService,
		private readonly microsoft: MicrosoftSyncService,
		private readonly googleConnections: GoogleConnectionService,
		private readonly microsoftConnections: MicrosoftConnectionService,
	) {}

	async runDue(): Promise<TickSummary> {
		const startedAt = Date.now();
		const summary: TickSummary = {
			attempted: 0,
			synced: 0,
			skipped: 0,
			rateLimited: 0,
			failed: 0,
			durationMs: 0,
		};

		await this.googleConnections.reconcileAll();
		await this.microsoftConnections.reconcileAll();

		const due = await this.state.due(new Date());

		for (const [index, row] of due.entries()) {
			if (Date.now() - startedAt > TICK_BUDGET_MS) {
				this.logger.log({
					message: "Sync tick budget reached",
					remaining: due.length - index,
				});
				break;
			}

			if (!(await this.state.claim(row, new Date()))) continue;

			summary.attempted += 1;

			try {
				const outcome = await this.runOne(row.userId, row.source);

				if (outcome === null || outcome.status === "skipped") {
					summary.skipped += 1;
					await this.state.release(row.id);
				} else if (outcome.status === "rate-limited") {
					summary.rateLimited += 1;
				} else if (
					outcome.status === "failed" ||
					outcome.status === "reconnect"
				) {
					summary.failed += 1;
				} else {
					summary.synced += 1;
				}
			} catch (error) {
				summary.failed += 1;
				await this.state.markFailed(
					row.id,
					error instanceof Error ? error.message : String(error),
				);
				this.logger.error(
					{
						message: "Sync threw",
						userId: row.userId,
						source: row.source,
					},
					error instanceof Error ? error.stack : String(error),
				);

				syncError({ error, source: row.source });
			}
		}

		summary.durationMs = Date.now() - startedAt;

		this.logger.log({
			message: "Mailbox sync tick",
			attempted: summary.attempted,
			synced: summary.synced,
			skipped: summary.skipped,
			rateLimited: summary.rateLimited,
			failed: summary.failed,
			durationMs: summary.durationMs,
		});

		return summary;
	}

	private async runOne(userId: string, source: string) {
		if (isGoogleSyncSource(source)) return this.google.runOne(userId, source);

		if (isMicrosoftSyncSource(source)) {
			return this.microsoft.runOne(userId, source);
		}

		return null;
	}
}
