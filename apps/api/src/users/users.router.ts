import { Inject } from "@nestjs/common";
import { Ctx, Query, Router, UseMiddlewares } from "nestjs-trpc";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { UsersService } from "./users.service";

const usersListOutput = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		email: z.string(),
		image: z.string().nullable(),
	}),
);

@Router({ alias: "users" })
@UseMiddlewares(AuthMiddleware)
export class UsersRouter {
	constructor(
		@Inject(UsersService) private readonly users: UsersService,
		@Inject(AuthService) private readonly auth: AuthService,
	) {}

	@Query()
	async me(@Ctx() ctx: AuthedTrpcContext) {
		return this.auth.getProfile(ctx.user.id);
	}

	@Query({
		output: usersListOutput,
		meta: restMeta("GET", "/users", ["Users"]),
	})
	async list() {
		return this.users.list();
	}
}
