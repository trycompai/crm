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
	marketingCampaignIdInput,
	marketingListInput,
	marketingPlanInput,
} from "./marketing.contracts";
import { MarketingService } from "./marketing.service";

@Router({ alias: "marketing" })
@UseMiddlewares(AuthMiddleware)
export class MarketingRouter {
	constructor(
		@Inject(MarketingService) private readonly marketing: MarketingService,
	) {}

	@Query({ input: marketingListInput })
	async list(@Input() input: z.infer<typeof marketingListInput>) {
		return this.marketing.list(input);
	}

	@Query({ input: marketingCampaignIdInput })
	async byId(@Input("id") id: string) {
		return this.marketing.byId(id);
	}

	@Mutation({ input: marketingPlanInput })
	async plan(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof marketingPlanInput>,
	) {
		return this.marketing.plan(input, ctx.user.id);
	}
}
