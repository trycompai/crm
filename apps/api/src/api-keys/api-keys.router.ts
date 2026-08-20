import { Inject } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext, BaseTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { SessionOnlyMiddleware } from "../trpc/middlewares/session-only.middleware";
import { restMeta } from "../trpc/openapi";
import {
	apiKeyListInput,
	apiKeyListOutput,
	createApiKeyInput,
	createApiKeyOutput,
	revokeApiKeyInput,
	revokeApiKeyOutput,
} from "./api-keys.contracts";
import { ApiKeysService } from "./api-keys.service";

function headersOf(ctx: BaseTrpcContext): Headers {
	return fromNodeHeaders(ctx.req?.headers ?? {});
}

@Router({ alias: "apiKeys" })
@UseMiddlewares(AuthMiddleware, SessionOnlyMiddleware)
export class ApiKeysRouter {
	constructor(
		@Inject(ApiKeysService) private readonly apiKeys: ApiKeysService,
	) {}

	@Query({
		input: apiKeyListInput,
		output: apiKeyListOutput,
		meta: restMeta("GET", "/api-keys", ["API Keys"]),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof apiKeyListInput>,
	) {
		return this.apiKeys.list(ctx.user.id, input);
	}

	@Mutation({
		input: createApiKeyInput,
		output: createApiKeyOutput,
		meta: restMeta("POST", "/api-keys", ["API Keys"]),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createApiKeyInput>,
	) {
		return this.apiKeys.create(ctx.user.id, headersOf(ctx), input);
	}

	@Mutation({
		input: revokeApiKeyInput,
		output: revokeApiKeyOutput,
		meta: restMeta("DELETE", "/api-keys/{id}", ["API Keys"]),
	})
	async revoke(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof revokeApiKeyInput>,
	) {
		return this.apiKeys.revoke(ctx.user.id, headersOf(ctx), input);
	}
}
