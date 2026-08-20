import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	addDomainInput,
	companyActivityInput,
	contactActivityInput,
	cookieLifetimeInput,
	removeDomainInput,
	rotateSiteIdOutput,
	sourcesOutput,
	trackedDomainOutput,
	trackingFlagInput,
	trackingSettingsOutput,
	verifyInput,
	verifyOutput,
	websiteActivityOutput,
} from "./tracking.contracts";
import { TrackingService } from "./tracking.service";

@Router({ alias: "tracking" })
@UseMiddlewares(AuthMiddleware)
export class TrackingRouter {
	constructor(
		@Inject(TrackingService) private readonly tracking: TrackingService,
	) {}

	@Query({
		output: trackingSettingsOutput,
		meta: restMeta("GET", "/tracking/settings", ["Tracking"]),
	})
	async settings(@Ctx() ctx: AuthedTrpcContext) {
		return this.tracking.settings(ctx.user.id);
	}

	@Mutation({
		input: trackingFlagInput,
		output: z.void(),
		meta: restMeta("PATCH", "/tracking/flags", ["Tracking"]),
	})
	async setFlag(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof trackingFlagInput>,
	) {
		return this.tracking.setFlag(ctx.user.id, input.flag, input.enabled);
	}

	@Mutation({
		input: cookieLifetimeInput,
		output: z.void(),
		meta: restMeta("PATCH", "/tracking/cookie-lifetime", ["Tracking"]),
	})
	async setCookieLifetime(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof cookieLifetimeInput>,
	) {
		return this.tracking.setCookieDays(ctx.user.id, input.days);
	}

	@Mutation({
		input: addDomainInput,
		output: trackedDomainOutput,
		meta: restMeta("POST", "/tracking/domains", ["Tracking"]),
	})
	async addDomain(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof addDomainInput>,
	) {
		return this.tracking.addDomain(ctx.user.id, input);
	}

	@Mutation({
		input: removeDomainInput,
		output: z.void(),
		meta: restMeta("DELETE", "/tracking/domains/{id}", ["Tracking"]),
	})
	async removeDomain(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof removeDomainInput>,
	) {
		return this.tracking.removeDomain(ctx.user.id, input.id);
	}

	@Mutation({
		output: rotateSiteIdOutput,
		meta: restMeta("POST", "/tracking/site-id/rotate", ["Tracking"]),
	})
	async rotateSiteId(@Ctx() ctx: AuthedTrpcContext) {
		return this.tracking.rotateSiteId(ctx.user.id);
	}

	@Mutation({
		input: verifyInput,
		output: verifyOutput,
		meta: restMeta("POST", "/tracking/verify", ["Tracking"]),
	})
	async verify(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof verifyInput>,
	) {
		return this.tracking.verify(ctx.user.id, input.url);
	}

	@Query({
		output: sourcesOutput,
		meta: restMeta("GET", "/tracking/sources", ["Tracking"]),
	})
	async sources(@Ctx() ctx: AuthedTrpcContext) {
		return this.tracking.sources(ctx.user.id);
	}

	@Query({
		input: companyActivityInput,
		output: websiteActivityOutput,
		meta: restMeta("GET", "/tracking/companies/{companyId}/activity", [
			"Tracking",
		]),
	})
	async companyActivity(@Input() input: z.infer<typeof companyActivityInput>) {
		return this.tracking.activityForCompany(input.companyId);
	}

	@Query({
		input: contactActivityInput,
		output: websiteActivityOutput,
		meta: restMeta("GET", "/tracking/contacts/{contactId}/activity", [
			"Tracking",
		]),
	})
	async contactActivity(@Input() input: z.infer<typeof contactActivityInput>) {
		return this.tracking.activityForContact(input.contactId);
	}
}
