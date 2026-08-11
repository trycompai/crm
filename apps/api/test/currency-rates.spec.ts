import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, RateSource } from "@crm/db";
import { writeReportingCurrency } from "@crm/db/settings";
import { RatesService } from "../src/currency/rates.service";

const suffix = process.env.TEST_RUN_ID ?? "currency-rates-spec";

describe("exchange rate refresh", () => {
	const originalFetch = globalThis.fetch;

	beforeAll(async () => {
		await writeReportingCurrency(db, "USD");
		await db.exchangeRate.deleteMany({
			where: {
				baseCurrency: "USD",
				quoteCurrency: { in: ["EUR", "CHF"] },
			},
		});
	});

	afterAll(async () => {
		globalThis.fetch = originalFetch;
		await db.exchangeRate.deleteMany({
			where: {
				baseCurrency: "USD",
				quoteCurrency: { in: ["EUR", "CHF"] },
			},
		});
	});

	it("drops stale fetched quotes omitted by a successful provider response", async () => {
		await db.exchangeRate.create({
			data: {
				baseCurrency: "USD",
				quoteCurrency: "CHF",
				rate: "1.25",
				asOf: new Date("2026-08-01T00:00:00.000Z"),
				source: RateSource.FETCHED,
				provider: `stale-${suffix}`,
			},
		});
		globalThis.fetch = Object.assign(
			async () =>
				new Response(
					JSON.stringify({
						result: "success",
						base_code: "USD",
						time_last_update_unix: 1_786_080_000,
						rates: { USD: 1, EUR: 0.8 },
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			{ preconnect: originalFetch.preconnect },
		);

		const result = await new RatesService(db).refresh();

		expect(result.ok).toBe(true);
		expect(
			await db.exchangeRate.findUnique({
				where: {
					baseCurrency_quoteCurrency_source: {
						baseCurrency: "USD",
						quoteCurrency: "CHF",
						source: RateSource.FETCHED,
					},
				},
			}),
		).toBeNull();
		expect(
			await db.exchangeRate.findUnique({
				where: {
					baseCurrency_quoteCurrency_source: {
						baseCurrency: "USD",
						quoteCurrency: "EUR",
						source: RateSource.FETCHED,
					},
				},
			}),
		).not.toBeNull();
	});
});
