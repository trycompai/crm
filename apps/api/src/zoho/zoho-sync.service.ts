import { Injectable } from "@nestjs/common";
import { SyncStateService } from "../mailbox/sync-state.service";
import { ZOHO_SYNC_SOURCES, type ZohoSyncSource } from "./zoho.constants";
import { ZohoMailSyncService } from "./zoho-mail-sync.service";

@Injectable()
export class ZohoSyncService {
	constructor(
		private readonly state: SyncStateService,
		private readonly mail: ZohoMailSyncService,
	) {}

	async runOne(userId: string, source: ZohoSyncSource) {
		const row = await this.state.get(userId, source);
		if (!row) return null;

		return this.mail.sync(row);
	}

	async runForUser(userId: string): Promise<void> {
		for (const source of ZOHO_SYNC_SOURCES) {
			await this.runOne(userId, source);
		}
	}
}
