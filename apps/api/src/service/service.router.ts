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
	serviceCaseIdInput,
	serviceListInput,
	serviceRecoverInboundInput,
} from "./service.contracts";
import { ServiceService } from "./service.service";

@Router({ alias: "service" })
@UseMiddlewares(AuthMiddleware)
export class ServiceRouter {
	constructor(
		@Inject(ServiceService) private readonly service: ServiceService,
	) {}

	@Query({ input: serviceListInput })
	async list(@Input() input: z.infer<typeof serviceListInput>) {
		return this.service.list(input);
	}

	@Query({ input: serviceCaseIdInput })
	async byId(@Input("id") id: string) {
		return this.service.byId(id);
	}

	@Mutation({ input: serviceRecoverInboundInput })
	async recoverInbound(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof serviceRecoverInboundInput>,
	) {
		return this.service.recoverInbound(input, ctx.user.id);
	}
}
