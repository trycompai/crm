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
import { ConversationService } from "./conversation.service";
import {
	calendarEventInput,
	calendarEventOutput,
	emailThreadOutput,
	googleConnectionStatusOutput,
	purgeSyncedDataOutput,
	revokeAccessOutput,
	setAutoCreateInput,
	suppressDomainInput,
	suppressDomainOutput,
	threadInput,
} from "./google.contracts";
import { GoogleConnectionService } from "./google-connection.service";
import { GoogleSyncService } from "./google-sync.service";

@Router({ alias: "google" })
@UseMiddlewares(AuthMiddleware)
export class GoogleRouter {
	constructor(
		@Inject(GoogleConnectionService)
		private readonly connection: GoogleConnectionService,
		@Inject(GoogleSyncService) private readonly sync: GoogleSyncService,
		@Inject(ConversationService)
		private readonly conversations: ConversationService,
	) {}

	@Query({
		output: googleConnectionStatusOutput,
		meta: restMeta("GET", "/google/status", ["Google"]),
	})
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		output: purgeSyncedDataOutput,
		meta: restMeta("POST", "/google/purge-synced-data", ["Google"]),
	})
	async purgeSyncedData(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.purgeSyncedData(ctx.user.id);
	}

	@Mutation({
		output: revokeAccessOutput,
		meta: restMeta("POST", "/google/revoke", ["Google"]),
	})
	async revokeAccess(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.revoke(ctx.user.id);
	}

	@Mutation({
		output: googleConnectionStatusOutput,
		meta: restMeta("POST", "/google/sync", ["Google"]),
	})
	async syncNow(@Ctx() ctx: AuthedTrpcContext) {
		await this.sync.runForUser(ctx.user.id);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		input: setAutoCreateInput,
		output: googleConnectionStatusOutput,
		meta: restMeta("PATCH", "/google/auto-create", ["Google"]),
	})
	async setAutoCreate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAutoCreateInput>,
	) {
		await this.connection.setAutoCreate(
			ctx.user.id,
			input.source,
			input.enabled,
		);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		input: suppressDomainInput,
		output: suppressDomainOutput,
		meta: restMeta("POST", "/google/suppress-domain", ["Google"]),
	})
	async suppressDomain(@Input() input: z.infer<typeof suppressDomainInput>) {
		return this.connection.suppressDomain(input.domain, {
			reason: input.reason,
			purge: input.purge,
		});
	}

	@Query({
		input: threadInput,
		output: emailThreadOutput,
		meta: restMeta("GET", "/google/threads/{threadId}", ["Google"]),
	})
	async thread(@Input("threadId") threadId: string) {
		return this.conversations.thread(threadId);
	}

	@Query({
		input: calendarEventInput,
		output: calendarEventOutput,
		meta: restMeta("GET", "/google/events/{eventId}", ["Google"]),
	})
	async event(@Input("eventId") eventId: string) {
		return this.conversations.event(eventId);
	}
}
