import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

@Injectable()
export class TrackingRollupService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async run(before: Date): Promise<number> {
		const rolled = await this.db.$executeRaw`
			INSERT INTO "trackedPageDaily" ("day", "host", "path", "views", "visitors")
			SELECT
				date_trunc('day', "occurredAt") AS "day",
				"host",
				"path",
				count(*)::int AS "views",
				count(DISTINCT "visitorId")::int AS "visitors"
			FROM "trackedEvent"
			WHERE "occurredAt" < ${before} AND "type" = 'page_view'
			GROUP BY 1, 2, 3
			ON CONFLICT ("day", "host", "path") DO UPDATE
			SET "views" = GREATEST("trackedPageDaily"."views", EXCLUDED."views"),
				"visitors" = GREATEST("trackedPageDaily"."visitors", EXCLUDED."visitors");
		`;

		return rolled;
	}
}
