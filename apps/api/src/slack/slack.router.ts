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
	slackChannelsInput,
	slackChannelsOutput,
	slackCreateChannelInput,
	slackCreateChannelOutput,
	slackDisconnectOutput,
	slackJoinChannelInput,
	slackJoinChannelOutput,
	slackMatchesOutput,
	slackRefreshPeopleOutput,
	slackStatusOutput,
} from "./slack.contracts";
import { SlackConnectionService } from "./slack-connection.service";

@Router({ alias: "slack" })
@UseMiddlewares(AuthMiddleware)
export class SlackRouter {
	constructor(
		@Inject(SlackConnectionService)
		private readonly connection: SlackConnectionService,
	) {}

	@Query({
		output: slackStatusOutput,
		meta: restMeta("GET", "/slack/status", ["Slack"]),
	})
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Query({
		output: slackMatchesOutput,
		meta: restMeta("GET", "/slack/matches", ["Slack"]),
	})
	matches(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.matches(ctx.user.id);
	}

	@Query({
		input: slackChannelsInput,
		output: slackChannelsOutput,
		meta: restMeta("GET", "/slack/channels", ["Slack"]),
	})
	channels(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof slackChannelsInput>,
	) {
		return this.connection.channels(input, ctx.user.id);
	}

	@Mutation({
		input: slackJoinChannelInput,
		output: slackJoinChannelOutput,
		meta: restMeta("POST", "/slack/channels/{channelId}/join", ["Slack"]),
	})
	joinChannel(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof slackJoinChannelInput>,
	) {
		return this.connection.joinChannel(input, ctx.user.id);
	}

	@Mutation({
		output: slackRefreshPeopleOutput,
		meta: restMeta("POST", "/slack/people/refresh", ["Slack"]),
	})
	refreshPeople(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.refreshPeople(ctx.user.id);
	}

	@Mutation({
		input: slackCreateChannelInput,
		output: slackCreateChannelOutput,
		meta: restMeta("POST", "/slack/channels", ["Slack"]),
	})
	createChannel(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof slackCreateChannelInput>,
	) {
		return this.connection.createChannel(input, ctx.user.id);
	}

	@Mutation({
		output: slackDisconnectOutput,
		meta: restMeta("DELETE", "/slack/connection", ["Slack"]),
	})
	disconnect(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.disconnect(ctx.user.id);
	}
}
