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
	currencySettingsOutput,
	removeManualRateInput,
	setManualRateInput,
	setReportingCurrencyInput,
} from "./currency.contracts";
import { CurrencyService } from "./currency.service";

@Router({ alias: "currency" })
@UseMiddlewares(AuthMiddleware)
export class CurrencyRouter {
	constructor(
		@Inject(CurrencyService) private readonly currency: CurrencyService,
	) {}

	@Query({
		output: currencySettingsOutput,
		meta: restMeta("GET", "/currency/settings", ["Currency"]),
	})
	async settings(@Ctx() ctx: AuthedTrpcContext) {
		return this.currency.settings(ctx.user.id);
	}

	@Mutation({
		input: setReportingCurrencyInput,
		output: currencySettingsOutput,
		meta: restMeta("PATCH", "/currency/reporting-currency", ["Currency"]),
	})
	async setReportingCurrency(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setReportingCurrencyInput>,
	) {
		return this.currency.setReportingCurrency(ctx.user.id, input.currency);
	}

	@Mutation({
		input: setManualRateInput,
		output: currencySettingsOutput,
		meta: restMeta("PUT", "/currency/rates/{currency}", ["Currency"]),
	})
	async setManualRate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setManualRateInput>,
	) {
		return this.currency.setManualRate(ctx.user.id, input.currency, input.rate);
	}

	@Mutation({
		input: removeManualRateInput,
		output: currencySettingsOutput,
		meta: restMeta("DELETE", "/currency/rates/{currency}", ["Currency"]),
	})
	async removeManualRate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof removeManualRateInput>,
	) {
		return this.currency.removeManualRate(ctx.user.id, input.currency);
	}

	@Mutation({
		output: currencySettingsOutput,
		meta: restMeta("POST", "/currency/rates/refresh", ["Currency"]),
	})
	async refreshRates(@Ctx() ctx: AuthedTrpcContext) {
		return this.currency.refresh(ctx.user.id);
	}
}
