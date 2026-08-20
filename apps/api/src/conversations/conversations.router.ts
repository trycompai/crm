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
import { ConversationSharingService } from "./conversation-sharing.service";
import {
	builderConversationCreateInput,
	builderConversationDetailOutput,
	builderConversationSubmitInput,
	builderListOutput,
	builderQuestionResponseInput,
	builderResourceSearchInput,
	builderResourcesOutput,
	builderResponseRatingInput,
	builderResponseRatingOutput,
	conversationEventsInput,
	conversationEventsOutput,
	conversationIdInput,
	conversationIdOutput,
	conversationListInput,
	conversationListOutput,
	conversationSaveInput,
	conversationShareStatusOutput,
	conversationShareTokenOutput,
	sharedConversationInput,
	sharedConversationOutput,
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

	@Query({
		input: conversationListInput,
		output: conversationListOutput,
		meta: restMeta("GET", "/conversations", ["Conversations"]),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof conversationListInput>,
	) {
		return this.conversations.list(input, ctx.user.id);
	}

	@Query({
		output: builderListOutput,
		meta: restMeta("GET", "/conversations/builder", ["Conversations"]),
	})
	async builderList(@Ctx() ctx: AuthedTrpcContext) {
		return this.conversations.listBuilder(ctx.user.id);
	}

	@Query({
		input: builderResourceSearchInput,
		output: builderResourcesOutput,
		meta: restMeta("GET", "/conversations/builder-resources", [
			"Conversations",
		]),
	})
	async builderResources(@Ctx() ctx: AuthedTrpcContext, @Input("q") q: string) {
		return this.conversations.builderResources(q, ctx.user.id);
	}

	@Query({
		input: conversationIdInput,
		output: builderConversationDetailOutput,
		meta: restMeta("GET", "/conversations/builder/{id}", ["Conversations"]),
	})
	async builderById(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.conversations.builderById(id, ctx.user.id);
	}

	@Query({
		input: conversationEventsInput,
		output: conversationEventsOutput,
		meta: restMeta("GET", "/conversations/{id}/events", ["Conversations"]),
	})
	async events(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof conversationEventsInput>,
	) {
		return this.conversations.events(input, ctx.user.id);
	}

	@Mutation({
		input: conversationSaveInput,
		output: conversationIdOutput,
		meta: restMeta("POST", "/conversations", ["Conversations"]),
	})
	async save(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof conversationSaveInput>,
	) {
		return this.conversations.save(input, ctx.user.id);
	}

	@Mutation({
		input: builderConversationCreateInput,
		output: conversationIdOutput,
		meta: restMeta("POST", "/conversations/builder", ["Conversations"]),
	})
	async createBuilder(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof builderConversationCreateInput>,
	) {
		return this.conversations.createBuilder(input, ctx.user.id);
	}

	@Mutation({
		input: builderConversationSubmitInput,
		output: conversationIdOutput,
		meta: restMeta("POST", "/conversations/{id}/submit-builder", [
			"Conversations",
		]),
	})
	async submitBuilder(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof builderConversationSubmitInput>,
	) {
		return this.conversations.submitBuilder(input, ctx.user.id);
	}

	@Mutation({
		input: builderQuestionResponseInput,
		output: conversationIdOutput,
		meta: restMeta("POST", "/conversations/{id}/answer-builder-question", [
			"Conversations",
		]),
	})
	async answerBuilderQuestion(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof builderQuestionResponseInput>,
	) {
		return this.conversations.answerBuilderQuestion(input, ctx.user.id);
	}

	@Mutation({
		input: builderResponseRatingInput,
		output: builderResponseRatingOutput,
		meta: restMeta("POST", "/conversations/{id}/rate-builder-response", [
			"Conversations",
		]),
	})
	async rateBuilderResponse(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof builderResponseRatingInput>,
	) {
		return this.conversations.rateBuilderResponse(input, ctx.user.id);
	}

	@Mutation({
		input: conversationIdInput,
		output: conversationIdOutput,
		meta: restMeta("PATCH", "/conversations/{id}/read", ["Conversations"]),
	})
	async markRead(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.conversations.markRead(id, ctx.user.id);
	}

	@Query({
		input: conversationIdInput,
		output: conversationShareStatusOutput,
		meta: restMeta("GET", "/conversations/{id}/share", ["Conversations"]),
	})
	async shareStatus(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.sharing.status(id, ctx.user.id);
	}

	@Mutation({
		input: conversationIdInput,
		output: conversationShareTokenOutput,
		meta: restMeta("POST", "/conversations/{id}/share", ["Conversations"]),
	})
	async createShare(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.sharing.create(id, ctx.user.id);
	}

	@Mutation({
		input: conversationIdInput,
		output: conversationIdOutput,
		meta: restMeta("DELETE", "/conversations/{id}/share", ["Conversations"]),
	})
	async revokeShare(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.sharing.revoke(id, ctx.user.id);
	}

	@Query({
		input: sharedConversationInput,
		output: sharedConversationOutput,
		meta: restMeta("GET", "/conversations/shared/{token}", ["Conversations"]),
	})
	async shared(@Ctx() ctx: AuthedTrpcContext, @Input("token") token: string) {
		return this.sharing.resolve(token, ctx.user.id);
	}

	@Mutation({
		input: conversationIdInput,
		output: conversationIdOutput,
		meta: restMeta("DELETE", "/conversations/{id}", ["Conversations"]),
	})
	async remove(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.conversations.remove(id, ctx.user.id);
	}
}
