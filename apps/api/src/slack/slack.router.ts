import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { slackJoinChannelInput } from "./slack.contracts";
import { SlackConnectionService } from "./slack-connection.service";

@Router({ alias: "slack" })
@UseMiddlewares(AuthMiddleware)
export class SlackRouter {
	constructor(
		@Inject(SlackConnectionService)
		private readonly connection: SlackConnectionService,
	) {}

	@Query()
	status() {
		return this.connection.status();
	}

	@Query()
	matches() {
		return this.connection.matches();
	}

	@Query()
	channels() {
		return this.connection.channels();
	}

	@Mutation({ input: slackJoinChannelInput })
	joinChannel(@Input() input: z.infer<typeof slackJoinChannelInput>) {
		return this.connection.joinChannel(input);
	}

	@Mutation()
	refreshPeople() {
		return this.connection.refreshPeople();
	}

	@Mutation()
	disconnect() {
		return this.connection.disconnect();
	}
}
