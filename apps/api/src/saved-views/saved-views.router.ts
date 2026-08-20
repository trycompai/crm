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
	savedViewCreateInput,
	savedViewDeleteOutput,
	savedViewIdInput,
	savedViewListInput,
	savedViewListOutput,
	savedViewOutput,
	savedViewUpdateArgs,
} from "./saved-views.contracts";
import { SavedViewsService } from "./saved-views.service";

@Router({ alias: "savedViews" })
@UseMiddlewares(AuthMiddleware)
export class SavedViewsRouter {
	constructor(
		@Inject(SavedViewsService) private readonly savedViews: SavedViewsService,
	) {}

	@Query({
		input: savedViewListInput,
		output: savedViewListOutput,
		meta: restMeta("GET", "/saved-views", ["Saved Views"]),
	})
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof savedViewListInput>,
	) {
		return this.savedViews.list(input.entity, ctx.user.id);
	}

	@Mutation({
		input: savedViewCreateInput,
		output: savedViewOutput,
		meta: restMeta("POST", "/saved-views", ["Saved Views"]),
	})
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof savedViewCreateInput>,
	) {
		return this.savedViews.create(input, ctx.user.id);
	}

	@Mutation({
		input: savedViewUpdateArgs,
		output: savedViewOutput,
		meta: restMeta("PATCH", "/saved-views/{id}", ["Saved Views"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof savedViewUpdateArgs>,
	) {
		return this.savedViews.update(input.id, input.data, ctx.user.id);
	}

	@Mutation({
		input: savedViewIdInput,
		output: savedViewDeleteOutput,
		meta: restMeta("DELETE", "/saved-views/{id}", ["Saved Views"]),
	})
	async delete(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.savedViews.delete(id, ctx.user.id);
	}
}
