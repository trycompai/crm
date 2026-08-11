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
import {
	slackChannelsInput,
	slackCreateChannelInput,
	slackJoinChannelInput,
} from "./slack.contracts";
import { SlackConnectionService } from "./slack-connection.service";

@Router({ alias: "slack" })
@UseMiddlewares(AuthMiddleware)
export class SlackRouter {
	constructor(
		@Inject(SlackConnectionService)
		private readonly connection: SlackConnectionService,
	) {}

	@Query()
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Query()
	matches(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.matches(ctx.user.id);
	}

	@Query({ input: slackChannelsInput })
	channels(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof slackChannelsInput>,
	) {
		return this.connection.channels(input, ctx.user.id);
	}

	@Mutation({ input: slackJoinChannelInput })
	joinChannel(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof slackJoinChannelInput>,
	) {
		return this.connection.joinChannel(input, ctx.user.id);
	}

	@Mutation()
	refreshPeople(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.refreshPeople(ctx.user.id);
	}

	@Mutation({ input: slackCreateChannelInput })
	createChannel(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof slackCreateChannelInput>,
	) {
		return this.connection.createChannel(input, ctx.user.id);
	}

	@Mutation()
	disconnect(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.disconnect(ctx.user.id);
	}
}
