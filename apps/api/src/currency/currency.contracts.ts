import { RateSource } from "@crm/db";
import { isCurrencyCode } from "@crm/db/currency";
import { z } from "zod";

export const currencyCode = z
	.string()
	.trim()
	.length(3, "A currency code is three letters, like USD.")
	.refine(isCurrencyCode, "That is not a currency this CRM can convert.");

export const setReportingCurrencyInput = z.object({
	currency: currencyCode,
});

export type SetReportingCurrencyInput = z.infer<
	typeof setReportingCurrencyInput
>;

export const setManualRateInput = z.object({
	currency: currencyCode,
	rate: z
		.number()
		.positive("A rate has to be greater than zero.")
		.finite("That is not a rate."),
});

export type SetManualRateInput = z.infer<typeof setManualRateInput>;

export const removeManualRateInput = z.object({
	currency: currencyCode,
});

export type RemoveManualRateInput = z.infer<typeof removeManualRateInput>;

const rateSourceOutput = z.enum([RateSource.FETCHED, RateSource.MANUAL]);

export const currencyRateOutput = z.object({
	currency: z.string(),
	name: z.string().nullable(),
	rate: z.number(),
	asOf: z.string(),
	source: rateSourceOutput,
	provider: z.string().nullable(),
	overriding: z.boolean(),
});

export const currencyInUseOutput = z.object({
	currency: z.string(),
	name: z.string().nullable(),
	deals: z.number(),
	convertible: z.boolean(),
});

export const unconvertedOutput = z.object({
	count: z.number(),
	currencies: z.array(z.string()),
});

export const currencyMetaOutput = z.object({
	code: z.string(),
	name: z.string(),
	minorUnits: z.number(),
});

export const currencySettingsOutput = z.object({
	reportingCurrency: z.string(),
	refreshedAt: z.string().nullable(),
	rates: z.array(currencyRateOutput),
	inUse: z.array(currencyInUseOutput),
	unconverted: unconvertedOutput,
	catalog: z.array(currencyMetaOutput),
	canManage: z.boolean(),
});

export type CurrencyRate = z.infer<typeof currencyRateOutput>;
export type CurrencyInUse = z.infer<typeof currencyInUseOutput>;
export type CurrencySettings = z.infer<typeof currencySettingsOutput>;
