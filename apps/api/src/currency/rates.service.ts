import type { Db } from "@crm/db";
import { Prisma, RateSource } from "@crm/db";
import {
	CURRENCY_CODES,
	isCurrencyCode,
	normalizeCurrency,
} from "@crm/db/currency";
import {
	readRatesRefreshedAt,
	readReportingCurrency,
	writeRatesRefreshedAt,
} from "@crm/db/settings";
import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";

export const RATES_PROVIDER = "open.er-api.com";

const RATES_URL = "https://open.er-api.com/v6/latest";

const RATES_TIMEOUT_MS = 6_000;

const RATES_ATTEMPTS = 2;

const RETRY_DELAY_MS = 400;

export interface RateRefresh {
	ok: boolean;
	base: string;
	written: number;
	asOf: string | null;
	reason: string | null;
}

const UNREADABLE_FEED = {
	result: "",
	time_last_update_unix: null,
	rates: {},
	"error-type": null,
};

const openExchangeResponse = z
	.object({
		result: z.string().catch(""),
		time_last_update_unix: z
			.number()
			.refine(Number.isFinite)
			.nullable()
			.catch(null),
		rates: z.record(z.string(), z.json()).catch({}),
		"error-type": z.string().nullable().catch(null),
	})
	.catch(UNREADABLE_FEED);

function parseAsOf(seconds: number | null): Date | null {
	if (seconds === null) return null;
	const date = new Date(seconds * 1000);
	return Number.isNaN(date.getTime()) ? null : date;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class RatesService {
	private readonly logger = new Logger(RatesService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async refreshedAt(): Promise<Date | null> {
		return readRatesRefreshedAt(this.db);
	}

	async refresh(): Promise<RateRefresh> {
		const base = await readReportingCurrency(this.db);
		const quotes = await this.fetch(base);

		if (!quotes) {
			return {
				ok: false,
				base,
				written: 0,
				asOf: null,
				reason: `Could not reach ${RATES_PROVIDER}. Rates entered by hand are unaffected.`,
			};
		}

		const written = await this.store(base, quotes.rates, quotes.asOf);

		await writeRatesRefreshedAt(this.db, new Date());

		this.logger.log({
			message: "Exchange rates refreshed",
			base,
			written,
			asOf: quotes.asOf.toISOString(),
		});

		return {
			ok: true,
			base,
			written,
			asOf: quotes.asOf.toISOString(),
			reason: null,
		};
	}

	private async store(
		base: string,
		rates: Map<string, Prisma.Decimal>,
		asOf: Date,
	): Promise<number> {
		let written = 0;

		for (const [quoteCurrency, rate] of rates) {
			await this.db.exchangeRate.upsert({
				where: {
					baseCurrency_quoteCurrency_source: {
						baseCurrency: base,
						quoteCurrency,
						source: RateSource.FETCHED,
					},
				},
				create: {
					baseCurrency: base,
					quoteCurrency,
					rate,
					asOf,
					source: RateSource.FETCHED,
					provider: RATES_PROVIDER,
				},
				update: { rate, asOf, provider: RATES_PROVIDER },
			});

			written += 1;
		}

		const supported = [...CURRENCY_CODES];

		const stale = await this.db.exchangeRate.deleteMany({
			where: {
				source: RateSource.FETCHED,
				OR: [
					{ baseCurrency: { notIn: supported } },
					{ quoteCurrency: { notIn: supported } },
				],
			},
		});

		if (stale.count > 0) {
			this.logger.log({
				message: "Dropped fetched rates for currencies that are not supported",
				base,
				dropped: stale.count,
			});
		}

		return written;
	}

	private async fetch(
		base: string,
	): Promise<{ rates: Map<string, Prisma.Decimal>; asOf: Date } | null> {
		for (let attempt = 1; attempt <= RATES_ATTEMPTS; attempt += 1) {
			const quotes = await this.attempt(base, attempt);
			if (quotes) return quotes;

			if (attempt < RATES_ATTEMPTS) await wait(RETRY_DELAY_MS);
		}

		return null;
	}

	private async attempt(
		base: string,
		attempt: number,
	): Promise<{ rates: Map<string, Prisma.Decimal>; asOf: Date } | null> {
		try {
			const response = await fetch(`${RATES_URL}/${encodeURIComponent(base)}`, {
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(RATES_TIMEOUT_MS),
			});

			if (!response.ok) {
				this.logger.warn({
					message: "Exchange rate request failed",
					status: response.status,
					base,
					attempt,
				});
				return null;
			}

			const body = openExchangeResponse.parse(await response.json());

			if (body.result !== "success") {
				this.logger.warn({
					message: "Exchange rate provider refused the request",
					base,
					attempt,
					errorType: body["error-type"],
				});
				return null;
			}

			const asOf = parseAsOf(body.time_last_update_unix) ?? new Date();
			const rates = new Map<string, Prisma.Decimal>();

			for (const [code, value] of Object.entries(body.rates)) {
				const quoteCurrency = normalizeCurrency(code);
				if (!isCurrencyCode(quoteCurrency)) continue;
				if (quoteCurrency === normalizeCurrency(base)) continue;

				const perBase = Number(value);
				if (!Number.isFinite(perBase) || perBase <= 0) continue;

				rates.set(
					quoteCurrency,
					new Prisma.Decimal(1).dividedBy(perBase).toDecimalPlaces(10),
				);
			}

			if (rates.size === 0) {
				this.logger.warn({
					message: "Exchange rate response carried no usable rates",
					base,
					attempt,
				});
				return null;
			}

			return { rates, asOf };
		} catch (error) {
			this.logger.warn({
				message: "Exchange rates unavailable",
				base,
				attempt,
				reason: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}
}
