import { Inject } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext, BaseTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	deleteSsoProviderInput,
	deleteSsoProviderOutput,
	registerSsoProviderInput,
	ssoProviderListInput,
	ssoProviderListOutput,
	ssoProviderOutput,
	ssoSettingsOutput,
	ssoSignInOptionsOutput,
} from "./sso.contracts";
import { SsoService } from "./sso.service";

function headersOf(ctx: BaseTrpcContext): Headers {
	return fromNodeHeaders(ctx.req?.headers ?? {});
}

@Router({ alias: "sso" })
export class SsoRouter {
	constructor(@Inject(SsoService) private readonly sso: SsoService) {}

	@Query({
		output: ssoSignInOptionsOutput,
		meta: restMeta("GET", "/sso/sign-in-options", ["SSO"], {
			protect: false,
		}),
	})
	async signInOptions() {
		return this.sso.signInOptions();
	}

	@Query({
		output: ssoSettingsOutput,
		meta: restMeta("GET", "/sso/settings", ["SSO"]),
	})
	@UseMiddlewares(AuthMiddleware)
	async settings(@Ctx() ctx: AuthedTrpcContext) {
		return this.sso.settings(ctx.user.id);
	}

	@Query({
		input: ssoProviderListInput,
		output: ssoProviderListOutput,
		meta: restMeta("GET", "/sso", ["SSO"]),
	})
	@UseMiddlewares(AuthMiddleware)
	async list(@Input() input: z.infer<typeof ssoProviderListInput>) {
		return this.sso.list(input);
	}

	@Mutation({
		input: registerSsoProviderInput,
		output: ssoProviderOutput,
		meta: restMeta("POST", "/sso", ["SSO"]),
	})
	@UseMiddlewares(AuthMiddleware)
	async register(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof registerSsoProviderInput>,
	) {
		return this.sso.register(ctx.user.id, headersOf(ctx), input);
	}

	@Mutation({
		input: deleteSsoProviderInput,
		output: deleteSsoProviderOutput,
		meta: restMeta("DELETE", "/sso/{providerId}", ["SSO"]),
	})
	@UseMiddlewares(AuthMiddleware)
	async remove(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof deleteSsoProviderInput>,
	) {
		return this.sso.remove(ctx.user.id, headersOf(ctx), input);
	}
}
