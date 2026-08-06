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
import { ConversationSharingService } from "./conversation-sharing.service";
import {
	builderConversationCreateInput,
	builderConversationSubmitInput,
	builderQuestionResponseInput,
	builderResourceSearchInput,
	builderResponseRatingInput,
	conversationEventsInput,
	conversationIdInput,
	conversationListInput,
	conversationSaveInput,
	sharedConversationInput,
} from "./conversations.contracts";
import { ConversationsService } from "./conversations.service";

@Router({ alias: "conversations" })
@UseMiddlewares(AuthMiddleware)
export class ConversationsRouter {
	constructor(
		@Inject(ConversationsService)
		private readonly conversations: ConversationsService,
		@Inject(ConversationSharingService)
		private readonly sharing: ConversationSharingService,
	) {}

	@Query({ input: conversationListInput })
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof conversationListInput>,
	) {
		return this.conversations.list(input, ctx.user.id);
	}

	@Query()
	async builderList(@Ctx() ctx: AuthedTrpcContext) {
		return this.conversations.listBuilder(ctx.user.id);
	}

	@Query({ input: builderResourceSearchInput })
	async builderResources(@Ctx() ctx: AuthedTrpcContext, @Input("q") q: string) {
		return this.conversations.builderResources(q, ctx.user.id);
	}

	@Query({ input: conversationIdInput })
	async builderById(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.conversations.builderById(id, ctx.user.id);
	}

	@Query({ input: conversationEventsInput })
	async events(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof conversationEventsInput>,
	) {
		return this.conversations.events(input, ctx.user.id);
	}

	@Mutation({ input: conversationSaveInput })
	async save(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof conversationSaveInput>,
	) {
		return this.conversations.save(input, ctx.user.id);
	}

	@Mutation({ input: builderConversationCreateInput })
	async createBuilder(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof builderConversationCreateInput>,
	) {
		return this.conversations.createBuilder(input, ctx.user.id);
	}

	@Mutation({ input: builderConversationSubmitInput })
	async submitBuilder(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof builderConversationSubmitInput>,
	) {
		return this.conversations.submitBuilder(input, ctx.user.id);
	}

	@Mutation({ input: builderQuestionResponseInput })
	async answerBuilderQuestion(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof builderQuestionResponseInput>,
	) {
		return this.conversations.answerBuilderQuestion(input, ctx.user.id);
	}

	@Mutation({ input: builderResponseRatingInput })
	async rateBuilderResponse(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof builderResponseRatingInput>,
	) {
		return this.conversations.rateBuilderResponse(input, ctx.user.id);
	}

	@Mutation({ input: conversationIdInput })
	async markRead(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.conversations.markRead(id, ctx.user.id);
	}

	@Query({ input: conversationIdInput })
	async shareStatus(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.sharing.status(id, ctx.user.id);
	}

	@Mutation({ input: conversationIdInput })
	async createShare(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.sharing.create(id, ctx.user.id);
	}

	@Mutation({ input: conversationIdInput })
	async revokeShare(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.sharing.revoke(id, ctx.user.id);
	}

	@Query({ input: sharedConversationInput })
	async shared(@Ctx() ctx: AuthedTrpcContext, @Input("token") token: string) {
		return this.sharing.resolve(token, ctx.user.id);
	}

	@Mutation({ input: conversationIdInput })
	async remove(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.conversations.remove(id, ctx.user.id);
	}
}
