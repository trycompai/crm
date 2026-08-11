import type { Db } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import {
	configHash,
	mintSiteId,
	readTrackingConfig,
	type TrackingConfig,
} from "@crm/db/tracking";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { InjectDatabase } from "../database/database.constants";

const CONFIG_TTL_MS = 5 * 60_000;

const CONFIG_KEY = "tracking:config";

export interface CompiledConfig {
	config: TrackingConfig;
	hash: string;
}

@Injectable()
export class TrackingConfigService {
	private readonly logger = new Logger(TrackingConfigService.name);

	private generation = 0;

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	async compiled(): Promise<CompiledConfig | null> {
		const cached = await this.cache.get<CompiledConfig>(CONFIG_KEY);
		if (cached) return cached;

		const read = this.generation;
		const config = await readTrackingConfig(this.db);
		if (!config) return null;

		const compiled = { config, hash: configHash(config) };

		if (read === this.generation && (await this.current(compiled.hash))) {
			await this.cache.set(CONFIG_KEY, compiled, CONFIG_TTL_MS);
		}

		return compiled;
	}

	private async current(hash: string): Promise<boolean> {
		const row = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { trackingConfigHash: true },
		});

		return row?.trackingConfigHash === hash;
	}

	async forSite(siteId: string): Promise<CompiledConfig | null> {
		const compiled = await this.compiled();
		return compiled?.config.siteId === siteId ? compiled : null;
	}

	async invalidate(): Promise<void> {
		this.generation += 1;
		const written = this.generation;

		await this.cache.del(CONFIG_KEY);

		const config = await readTrackingConfig(this.db);

		if (!config) {
			await this.db.appSetting.updateMany({
				where: { id: SETTINGS_ID },
				data: { trackingConfigHash: null },
			});

			return;
		}

		const hash = configHash(config);

		await this.db.appSetting.update({
			where: { id: SETTINGS_ID },
			data: { trackingConfigHash: hash },
		});

		if (written !== this.generation) return;
		if (!(await this.current(hash))) return;

		await this.cache.set(CONFIG_KEY, { config, hash }, CONFIG_TTL_MS);
	}

	async ensureSiteId(): Promise<string> {
		const existing = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { trackingSiteId: true },
		});

		if (existing?.trackingSiteId) return existing.trackingSiteId;

		const trackingSiteId = mintSiteId();

		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, trackingSiteId },
			update: { trackingSiteId },
		});

		await this.invalidate();

		this.logger.log({ message: "Tracking site id minted" });

		return trackingSiteId;
	}

	async rotateSiteId(): Promise<string> {
		const trackingSiteId = mintSiteId();

		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, trackingSiteId },
			update: { trackingSiteId },
		});

		await this.invalidate();

		this.logger.warn({ message: "Tracking site id rotated" });

		return trackingSiteId;
	}
}
