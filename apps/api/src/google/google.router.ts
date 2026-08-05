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
import { ConversationService } from "./conversation.service";
import {
	calendarEventInput,
	setAutoCreateInput,
	suppressDomainInput,
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

	@Query()
	async status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation()
	async purgeSyncedData(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.purgeSyncedData(ctx.user.id);
	}

	@Mutation()
	async revokeAccess(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.revoke(ctx.user.id);
	}

	@Mutation()
	async syncNow(@Ctx() ctx: AuthedTrpcContext) {
		await this.sync.runForUser(ctx.user.id);
		return this.connection.status(ctx.user.id);
	}

	@Mutation({ input: setAutoCreateInput })
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

	@Mutation({ input: suppressDomainInput })
	async suppressDomain(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof suppressDomainInput>,
	) {
		return this.connection.suppressDomain(ctx.user.id, input.domain, {
			reason: input.reason,
			purge: input.purge,
		});
	}

	@Query({ input: threadInput })
	async thread(@Input("threadId") threadId: string) {
		return this.conversations.thread(threadId);
	}

	@Query({ input: calendarEventInput })
	async event(@Input("eventId") eventId: string) {
		return this.conversations.event(eventId);
	}
}
