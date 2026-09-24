import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { SyncStateService } from "../mailbox/sync-state.service";
import {
	MICROSOFT_SYNC_SOURCES,
	type MicrosoftSyncSource,
} from "./microsoft.constants";
import { OutlookSyncService } from "./outlook-sync.service";

@Injectable()
export class MicrosoftSyncService {
	constructor(
		private readonly state: SyncStateService,
		private readonly outlook: OutlookSyncService,
	) {}

	async runOne(userId: string, source: MicrosoftSyncSource) {
		const row = await this.state.get(userId, source);
		if (!row) return null;

		const live = await this.outlook.sync(row);
		if (live.status !== "synced") return live;

		const current = await this.state.get(userId, source);
		if (!current) return live;

		const backfill = await this.outlook.backfill(current);
		if (
			backfill.status === "reconnect" ||
			backfill.status === "rate-limited" ||
			backfill.status === "failed"
		) {
			return backfill;
		}

		return live;
	}

	async startBackfill(userId: string, from: Date): Promise<void> {
		const row = await this.state.get(userId, "outlook");
		if (!row) throw new NotFoundException("Outlook is not connected.");

		const until = new Date();
		if (Number.isNaN(from.getTime()) || from >= until) {
			throw new BadRequestException(
				"History import start must be earlier than now.",
			);
		}

		await this.state.startBackfill(row.id, from, until);

		const current = await this.state.get(userId, "outlook");
		if (current) await this.outlook.backfill(current);
	}

	async runForUser(userId: string): Promise<void> {
		for (const source of MICROSOFT_SYNC_SOURCES) {
			await this.runOne(userId, source);
		}
	}
}
