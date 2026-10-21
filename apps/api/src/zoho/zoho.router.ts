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
	setZohoAutoCreateInput,
	zohoConnectionStatusOutput,
	zohoPurgeSyncedDataOutput,
	zohoRevokeAccessOutput,
} from "./zoho.contracts";
import { ZohoConnectionService } from "./zoho-connection.service";
import { ZohoSyncService } from "./zoho-sync.service";

@Router({ alias: "zoho" })
@UseMiddlewares(AuthMiddleware)
export class ZohoRouter {
	constructor(
		@Inject(ZohoConnectionService)
		private readonly connection: ZohoConnectionService,
		@Inject(ZohoSyncService)
		private readonly sync: ZohoSyncService,
	) {}

	@Query({
		output: zohoConnectionStatusOutput,
		meta: restMeta("GET", "/zoho/status", ["Zoho"]),
	})
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		output: zohoPurgeSyncedDataOutput,
		meta: restMeta("POST", "/zoho/purge-synced-data", ["Zoho"]),
	})
	async purgeSyncedData(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.purgeSyncedData(ctx.user.id);
	}

	@Mutation({
		output: zohoRevokeAccessOutput,
		meta: restMeta("POST", "/zoho/revoke", ["Zoho"]),
	})
	async revokeAccess(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.revoke(ctx.user.id);
	}

	@Mutation({
		output: zohoConnectionStatusOutput,
		meta: restMeta("POST", "/zoho/sync", ["Zoho"]),
	})
	async syncNow(@Ctx() ctx: AuthedTrpcContext) {
		await this.sync.runForUser(ctx.user.id);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		input: setZohoAutoCreateInput,
		output: zohoConnectionStatusOutput,
		meta: restMeta("PATCH", "/zoho/auto-create", ["Zoho"]),
	})
	async setAutoCreate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setZohoAutoCreateInput>,
	) {
		await this.connection.setAutoCreate(
			ctx.user.id,
			input.source,
			input.enabled,
		);
		return this.connection.status(ctx.user.id);
	}
}
