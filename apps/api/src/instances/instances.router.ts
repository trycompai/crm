import { Inject } from "@nestjs/common";
import { Ctx, Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { instanceIdInput, instancesListInput } from "./instances.contracts";
import { InstancesService } from "./instances.service";

@Router({ alias: "instances" })
@UseMiddlewares(AuthMiddleware)
export class InstancesRouter {
	constructor(
		@Inject(InstancesService) private readonly instances: InstancesService,
	) {}

	@Query({ input: instancesListInput })
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof instancesListInput>,
	) {
		return this.instances.list(input, ctx.user.id);
	}

	@Query({ input: instanceIdInput })
	async byId(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.instances.byId(id, ctx.user.id);
	}
}
