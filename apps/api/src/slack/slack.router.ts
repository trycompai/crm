import { Inject } from "@nestjs/common";
import { Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
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

	@Mutation()
	refreshPeople() {
		return this.connection.refreshPeople();
	}

	@Mutation()
	disconnect() {
		return this.connection.disconnect();
	}
}
