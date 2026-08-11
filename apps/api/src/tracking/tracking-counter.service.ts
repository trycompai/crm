import type { Db } from "@crm/db";
import { windowExpiry } from "@crm/db/tracking";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

@Injectable()
export class TrackingCounterService {
	private readonly logger = new Logger(TrackingCounterService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async take(key: string, limit: number, amount = 1): Promise<boolean> {
		try {
			const counter = await this.db.trackingCounter.upsert({
				where: { key },
				create: { key, value: amount, expiresAt: windowExpiry(key) },
				update: { value: { increment: amount } },
				select: { value: true },
			});

			return counter.value <= limit;
		} catch (error) {
			this.logger.error(
				{ message: "Tracking counter could not be read — refusing the write" },
				error instanceof Error ? error.stack : String(error),
			);

			return false;
		}
	}

	async sweep(): Promise<number> {
		const removed = await this.db.trackingCounter.deleteMany({
			where: { expiresAt: { lt: new Date() } },
		});

		return removed.count;
	}
}
