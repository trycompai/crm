import { Inject } from "@nestjs/common";
import { Ctx, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	hubspotDisconnectOutput,
	hubspotStatusOutput,
} from "./hubspot.contracts";
import { HubspotConnectionService } from "./hubspot-connection.service";

@Router({ alias: "hubspot" })
@UseMiddlewares(AuthMiddleware)
export class HubspotRouter {
	constructor(
		@Inject(HubspotConnectionService)
		private readonly connection: HubspotConnectionService,
	) {}

	@Query({
		output: hubspotStatusOutput,
		meta: restMeta("GET", "/hubspot/status", ["HubSpot"]),
	})
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation({
		output: hubspotDisconnectOutput,
		meta: restMeta("DELETE", "/hubspot/connection", ["HubSpot"]),
	})
	disconnect(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.disconnect(ctx.user.id);
	}
}
