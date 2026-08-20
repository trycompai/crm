import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	microsoftConnectionStatusOutput,
	purgeSyncedDataOutput,
	revokeAccessOutput,
	setOutlookAutoCreateInput,
} from "./microsoft.contracts";
import { MicrosoftConnectionService } from "./microsoft-connection.service";
import { MicrosoftSyncService } from "./microsoft-sync.service";

@Router({ alias: "microsoft" })
@UseMiddlewares(AuthMiddleware)
export class MicrosoftRouter {
	constructor(
		@Inject(MicrosoftConnectionService)
		private readonly connection: MicrosoftConnectionService,
		@Inject(MicrosoftSyncService)
		private readonly sync: MicrosoftSyncService,
	) {}

	@Query({
		output: microsoftConnectionStatusOutput,
		meta: restMeta("GET", "/microsoft/status", ["Microsoft"]),
	})
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		output: purgeSyncedDataOutput,
		meta: restMeta("POST", "/microsoft/purge-synced-data", ["Microsoft"]),
	})
	async purgeSyncedData(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.purgeSyncedData(ctx.user.id);
	}

	@Mutation({
		output: revokeAccessOutput,
		meta: restMeta("POST", "/microsoft/revoke", ["Microsoft"]),
	})
	async revokeAccess(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.revoke(ctx.user.id);
	}

	@Mutation({
		output: microsoftConnectionStatusOutput,
		meta: restMeta("POST", "/microsoft/sync", ["Microsoft"]),
	})
	async syncNow(@Ctx() ctx: AuthedTrpcContext) {
		await this.sync.runForUser(ctx.user.id);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		input: setOutlookAutoCreateInput,
		output: microsoftConnectionStatusOutput,
		meta: restMeta("PATCH", "/microsoft/auto-create", ["Microsoft"]),
	})
	async setAutoCreate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setOutlookAutoCreateInput>,
	) {
		await this.connection.setAutoCreate(
			ctx.user.id,
			input.source,
			input.enabled,
		);
		return this.connection.status(ctx.user.id);
	}
}
