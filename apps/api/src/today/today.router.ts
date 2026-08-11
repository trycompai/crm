import { Ctx, Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { todayInput } from "./today.contracts";
import { TodayService } from "./today.service";

@Router({ alias: "today" })
@UseMiddlewares(AuthMiddleware)
export class TodayRouter {
	constructor(private readonly today: TodayService) {}

	@Query({ input: todayInput })
	async get(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof todayInput>,
	) {
		return this.today.get(input, ctx.user.id);
	}
}
