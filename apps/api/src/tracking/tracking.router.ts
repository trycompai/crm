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
	addDomainInput,
	companyActivityInput,
	contactActivityInput,
	cookieLifetimeInput,
	removeDomainInput,
	trackingFlagInput,
	verifyInput,
} from "./tracking.contracts";
import { TrackingService } from "./tracking.service";

@Router({ alias: "tracking" })
@UseMiddlewares(AuthMiddleware)
export class TrackingRouter {
	constructor(
		@Inject(TrackingService) private readonly tracking: TrackingService,
	) {}

	@Query()
	async settings(@Ctx() ctx: AuthedTrpcContext) {
		return this.tracking.settings(ctx.user.id);
	}

	@Mutation({ input: trackingFlagInput })
	async setFlag(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof trackingFlagInput>,
	) {
		return this.tracking.setFlag(ctx.user.id, input.flag, input.enabled);
	}

	@Mutation({ input: cookieLifetimeInput })
	async setCookieLifetime(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof cookieLifetimeInput>,
	) {
		return this.tracking.setCookieDays(ctx.user.id, input.days);
	}

	@Mutation({ input: addDomainInput })
	async addDomain(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof addDomainInput>,
	) {
		return this.tracking.addDomain(ctx.user.id, input);
	}

	@Mutation({ input: removeDomainInput })
	async removeDomain(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof removeDomainInput>,
	) {
		return this.tracking.removeDomain(ctx.user.id, input.id);
	}

	@Mutation()
	async rotateSiteId(@Ctx() ctx: AuthedTrpcContext) {
		return this.tracking.rotateSiteId(ctx.user.id);
	}

	@Mutation({ input: verifyInput })
	async verify(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof verifyInput>,
	) {
		return this.tracking.verify(ctx.user.id, input.url);
	}

	@Query()
	async sources(@Ctx() ctx: AuthedTrpcContext) {
		return this.tracking.sources(ctx.user.id);
	}

	@Query({ input: companyActivityInput })
	async companyActivity(@Input() input: z.infer<typeof companyActivityInput>) {
		return this.tracking.activityForCompany(input.companyId);
	}

	@Query({ input: contactActivityInput })
	async contactActivity(@Input() input: z.infer<typeof contactActivityInput>) {
		return this.tracking.activityForContact(input.contactId);
	}
}
