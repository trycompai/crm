import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { z } from "zod";

const VERCEL_CATALOG_URL = "https://ai-gateway.vercel.sh/v1/models";

const ORCAROUTER_CATALOG_URL = "https://api.orcarouter.ai/v1/models";

const ORCAROUTER_API_KEY_ENV = "ORCAROUTER_API_KEY";

const CATALOG_TTL_MS = 30 * 60_000;

const CATALOG_KEY = "settings:model-catalog";

const CATALOG_TIMEOUT_MS = 5_000;

const DEFAULT_ORCAROUTER_CONTEXT_WINDOW_TOKENS = 128_000;

export type ModelCatalogSource = "vercel" | "orcarouter";

export interface CatalogModel {
	id: string;
	name: string;
	provider: string;
	contextWindowTokens: number;
	pricing: { input: number; output: number } | null;
}

const gatewayRate = z
	.union([z.number(), z.string()])
	.transform((value) => Number(value))
	.refine((value) => Number.isFinite(value))
	.nullable()
	.catch(null);

const gatewayModel = z.object({
	id: z.string(),
	name: z.string().catch(""),
	owned_by: z.string().catch(""),
	type: z.string().catch(""),
	tags: z.array(z.json()).catch([]),
	context_window: z.number(),
	pricing: z
		.object({ input: gatewayRate, output: gatewayRate })
		.nullable()
		.catch(null),
});

type GatewayModel = z.infer<typeof gatewayModel>;

const gatewayCatalog = z
	.object({ data: z.array(z.json()).catch([]) })
	.catch({ data: [] });

const orcaModel = z.object({
	id: z.string(),
	name: z.string().catch(""),
	owned_by: z.string().catch(""),
	context_length: z.number().nullable().catch(null),
	pricing: z
		.object({ prompt: gatewayRate, completion: gatewayRate })
		.nullable()
		.catch(null),
});

const orcaCatalog = z
	.object({ data: z.array(z.json()).catch([]) })
	.catch({ data: [] });

function usable(model: GatewayModel): boolean {
	return model.type === "language" && model.tags.includes("tool-use");
}

function toCatalogModel(model: GatewayModel): CatalogModel {
	const input = model.pricing?.input ?? null;
	const output = model.pricing?.output ?? null;

	return {
		id: model.id,
		name: model.name || model.id,
		provider: model.owned_by || (model.id.split("/")[0] ?? model.id),
		contextWindowTokens: model.context_window,
		pricing: input !== null && output !== null ? { input, output } : null,
	};
}

function parseVercelCatalog(body: unknown): CatalogModel[] {
	const parsed = gatewayCatalog.safeParse(body);
	const models: CatalogModel[] = [];

	if (parsed.success) {
		for (const entry of parsed.data.data) {
			const model = gatewayModel.safeParse(entry);
			if (model.success && usable(model.data)) {
				models.push(toCatalogModel(model.data));
			}
		}
	}

	models.sort(
		(a, b) =>
			a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
	);

	return models;
}

function parseOrcaCatalog(body: unknown): CatalogModel[] {
	const parsed = orcaCatalog.safeParse(body);
	const models: CatalogModel[] = [];

	if (parsed.success) {
		for (const entry of parsed.data.data) {
			const model = orcaModel.safeParse(entry);
			if (!model.success) continue;

			const input = model.data.pricing?.prompt ?? null;
			const output = model.data.pricing?.completion ?? null;

			models.push({
				id: model.data.id,
				name: model.data.name || model.data.id,
				provider:
					model.data.owned_by || (model.data.id.split("/")[0] ?? model.data.id),
				contextWindowTokens:
					model.data.context_length ?? DEFAULT_ORCAROUTER_CONTEXT_WINDOW_TOKENS,
				pricing: input !== null && output !== null ? { input, output } : null,
			});
		}
	}

	models.sort(
		(a, b) =>
			a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
	);

	return models;
}

export function catalogSource(): ModelCatalogSource {
	return process.env[ORCAROUTER_API_KEY_ENV]?.trim() ? "orcarouter" : "vercel";
}

@Injectable()
export class ModelCatalogService {
	private readonly logger = new Logger(ModelCatalogService.name);

	constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

	source(): ModelCatalogSource {
		return catalogSource();
	}

	async models(): Promise<CatalogModel[] | null> {
		const source = catalogSource();
		const cacheKey = `${CATALOG_KEY}:${source}`;

		const cached = await this.cache.get<CatalogModel[]>(cacheKey);
		if (cached) return cached;

		const models = await this.fetchCatalog();
		if (!models) return null;

		await this.cache.set(cacheKey, models, CATALOG_TTL_MS);
		return models;
	}

	async find(id: string): Promise<CatalogModel | null> {
		const models = await this.models();
		return models?.find((model) => model.id === id) ?? null;
	}

	private async fetchCatalog(): Promise<CatalogModel[] | null> {
		const source = catalogSource();
		const url =
			source === "orcarouter" ? ORCAROUTER_CATALOG_URL : VERCEL_CATALOG_URL;

		try {
			const headers: Record<string, string> = { accept: "application/json" };

			if (source === "orcarouter") {
				const apiKey = process.env[ORCAROUTER_API_KEY_ENV]?.trim();
				if (apiKey) headers.authorization = `Bearer ${apiKey}`;
			}

			const response = await fetch(url, {
				headers,
				signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
			});

			if (!response.ok) {
				this.logger.warn({
					message: "Model catalog request failed",
					source,
					status: response.status,
				});
				return null;
			}

			const models =
				source === "orcarouter"
					? parseOrcaCatalog(await response.json())
					: parseVercelCatalog(await response.json());

			this.logger.log({
				message: "Model catalog loaded",
				source,
				models: models.length,
			});

			return models;
		} catch (error) {
			this.logger.warn({
				message: "Model catalog unavailable",
				source,
				reason: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}
}
