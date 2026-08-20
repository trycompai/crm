import { auth, DAY_SECONDS } from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import {
	HttpException,
	Injectable,
	InternalServerErrorException,
	Logger,
} from "@nestjs/common";
import { APIError } from "better-auth/api";
import { InjectDatabase } from "../database/database.constants";
import {
	type ListResult,
	type OrderByColumns,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ApiKeyListInput,
	ApiKeySummary,
	CreateApiKeyInput,
	CreatedApiKey,
	RevokeApiKeyInput,
} from "./api-keys.contracts";

const KEY_SELECT = {
	id: true,
	name: true,
	start: true,
	enabled: true,
	createdAt: true,
	lastRequest: true,
	expiresAt: true,
} satisfies Prisma.ApikeySelect;

type KeyRow = Prisma.ApikeyGetPayload<{ select: typeof KEY_SELECT }>;

const SORTABLE: OrderByColumns<Prisma.ApikeyOrderByWithRelationInput> = {
	name: (dir) => ({ name: dir }),
	createdAt: (dir) => ({ createdAt: dir }),
	lastRequest: (dir) => ({ lastRequest: dir }),
	expiresAt: (dir) => ({ expiresAt: dir }),
};

const STATUS_BY_CODE = new Map<string, number>([
	["BAD_REQUEST", 400],
	["UNAUTHORIZED", 401],
	["FORBIDDEN", 403],
	["NOT_FOUND", 404],
	["CONFLICT", 409],
	["UNPROCESSABLE_ENTITY", 400],
]);

function toSummary(row: KeyRow): ApiKeySummary {
	return {
		id: row.id,
		name: row.name,
		start: row.start,
		enabled: row.enabled ?? true,
		createdAt: row.createdAt.toISOString(),
		lastRequest: row.lastRequest?.toISOString() ?? null,
		expiresAt: row.expiresAt?.toISOString() ?? null,
	};
}

@Injectable()
export class ApiKeysService {
	private readonly logger = new Logger(ApiKeysService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(
		userId: string,
		input: ApiKeyListInput,
	): Promise<ListResult<ApiKeySummary>> {
		const where = this.searchWhere(userId, input.q);
		const { skip, take } = paginate(input);

		const [rows, total] = await Promise.all([
			this.db.apikey.findMany({
				where,
				skip,
				take,
				select: KEY_SELECT,
				orderBy: resolveOrderBy(input, SORTABLE, { createdAt: "desc" }),
			}),
			this.db.apikey.count({ where }),
		]);

		return { rows: rows.map(toSummary), total, facetCounts: {} };
	}

	async create(
		userId: string,
		headers: Headers,
		input: CreateApiKeyInput,
	): Promise<CreatedApiKey> {
		const created = await this.call(() =>
			auth.api.createApiKey({
				headers,
				body: {
					name: input.name,
					expiresIn:
						input.expiresInDays === null
							? null
							: input.expiresInDays * DAY_SECONDS,
				},
			}),
		);

		this.logger.log({
			message: "API key created",
			userId,
			apiKeyId: created.id,
		});

		return {
			id: created.id,
			name: created.name,
			start: created.start,
			enabled: created.enabled,
			createdAt: created.createdAt.toISOString(),
			lastRequest: created.lastRequest?.toISOString() ?? null,
			expiresAt: created.expiresAt?.toISOString() ?? null,
			key: created.key,
		};
	}

	async revoke(
		userId: string,
		headers: Headers,
		input: RevokeApiKeyInput,
	): Promise<{ id: string }> {
		await this.call(() =>
			auth.api.deleteApiKey({ headers, body: { keyId: input.id } }),
		);

		this.logger.log({
			message: "API key revoked",
			userId,
			apiKeyId: input.id,
		});

		return { id: input.id };
	}

	private searchWhere(userId: string, q: string): Prisma.ApikeyWhereInput {
		const where: Prisma.ApikeyWhereInput = { referenceId: userId };
		const term = q.trim();

		if (term) {
			where.name = { contains: term, mode: "insensitive" };
		}

		return where;
	}

	private async call<T>(run: () => Promise<T>): Promise<T> {
		try {
			return await run();
		} catch (error) {
			if (error instanceof APIError) {
				const status =
					STATUS_BY_CODE.get(error.body?.code ?? "") ?? error.statusCode;

				throw new HttpException(
					error.body?.message ?? "The API key could not be saved.",
					status,
				);
			}

			this.logger.error(
				{ message: "API key call failed" },
				error instanceof Error ? error.stack : String(error),
			);

			throw new InternalServerErrorException(
				"Could not reach the auth service.",
			);
		}
	}
}
