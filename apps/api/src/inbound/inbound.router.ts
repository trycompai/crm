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
import { granolaExcludeInput, granolaMatchInput } from "./inbound.contracts";
import { InboundService } from "./inbound.service";

@Router({ alias: "inbound" })
@UseMiddlewares(AuthMiddleware)
export class InboundRouter {
	constructor(private readonly inbound: InboundService) {}

	@Query()
	async status() {
		return this.inbound.status();
	}

	@Mutation()
	async syncNow() {
		return this.inbound.syncNow();
	}

	@Query()
	async granolaReview() {
		return this.inbound.granolaReview();
	}

	@Mutation({ input: granolaMatchInput })
	async matchGranola(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof granolaMatchInput>,
	) {
		return this.inbound.matchGranola(input, ctx.user.id);
	}

	@Mutation({ input: granolaExcludeInput })
	async excludeGranola(@Input() input: z.infer<typeof granolaExcludeInput>) {
		return this.inbound.excludeGranola(input);
	}
}
