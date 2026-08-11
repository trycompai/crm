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

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	async compiled(): Promise<CompiledConfig | null> {
		const cached = await this.cache.get<CompiledConfig>(CONFIG_KEY);
		if (cached) return cached;

		const config = await readTrackingConfig(this.db);
		if (!config) return null;

		const compiled = { config, hash: configHash(config) };
		await this.cache.set(CONFIG_KEY, compiled, CONFIG_TTL_MS);

		return compiled;
	}

	async forSite(siteId: string): Promise<CompiledConfig | null> {
		const compiled = await this.compiled();
		return compiled?.config.siteId === siteId ? compiled : null;
	}

	async invalidate(): Promise<void> {
		await this.cache.del(CONFIG_KEY);

		const config = await readTrackingConfig(this.db);
		if (!config) return;

		const hash = configHash(config);

		await this.db.appSetting.update({
			where: { id: SETTINGS_ID },
			data: { trackingConfigHash: hash },
		});

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
