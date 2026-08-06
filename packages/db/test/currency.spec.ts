import { describe, expect, it } from "bun:test";
import type { Db } from "../src/client";
import {
	CURRENCIES,
	currencyName,
	isCurrencyCode,
	isWellFormedCurrency,
	minorUnitsOf,
	normalizeCurrency,
} from "../src/currency";
import { applyRate, type ResolvedRate, resolveRate } from "../src/fx";
import { Prisma } from "../src/generated/prisma/client";
import { RateSource } from "../src/generated/prisma/enums";

type Row = {
	rate: Prisma.Decimal;
	asOf: Date;
	source: RateSource;
	provider: string | null;
};

function fakeDb(rows: Row[]): { db: Db; calls: number } {
	const state = { calls: 0 };

	const db = {
		exchangeRate: {
			findMany: async () => {
				state.calls += 1;
				return rows;
			},
		},
	} as unknown as Db;

	return {
		db,
		get calls() {
			return state.calls;
		},
	};
}

function row(
	rate: string,
	source: RateSource,
	provider: string | null = null,
): Row {
	return {
		rate: new Prisma.Decimal(rate),
		asOf: new Date("2026-08-01T00:00:00.000Z"),
		source,
		provider,
	};
}

describe("normalizeCurrency and isCurrencyCode", () => {
	it("accepts a code however a rep typed it", () => {
		for (const input of [" usd ", "Usd", "USD"]) {
			expect(normalizeCurrency(input)).toBe("USD");
			expect(isCurrencyCode(input)).toBe(true);
		}
	});

	it("offers only the eleven currencies most of the world trades in", () => {
		expect(CURRENCIES.map((entry) => entry.code)).toEqual([
			"USD",
			"EUR",
			"JPY",
			"GBP",
			"CNY",
			"AUD",
			"CAD",
			"CHF",
			"HKD",
			"SGD",
			"ZAR",
		]);
	});

	it("refuses a real currency it does not offer, and anything that is not one", () => {
		expect(isCurrencyCode("SEK")).toBe(false);
		expect(isCurrencyCode("ZZZ")).toBe(false);
		expect(isCurrencyCode("QQ")).toBe(false);
		expect(isCurrencyCode("")).toBe(false);
		expect(isCurrencyCode(null)).toBe(false);
	});

	it("knows the difference between well formed and real", () => {
		expect(isWellFormedCurrency("ZZZ")).toBe(true);
		expect(isCurrencyCode("ZZZ")).toBe(false);
		expect(isWellFormedCurrency("QQ")).toBe(false);
	});

	it("names the currencies it knows", () => {
		expect(currencyName("jpy")).toBe("Japanese Yen");
		expect(currencyName("ZZZ")).toBeNull();
	});
});

describe("minorUnitsOf", () => {
	it("knows the currencies that are not two-decimal", () => {
		expect(minorUnitsOf("JPY")).toBe(0);
	});

	it("assumes two for anything else, so an amount still round-trips", () => {
		expect(minorUnitsOf("USD")).toBe(2);
		expect(minorUnitsOf("ZZZ")).toBe(2);
		expect(minorUnitsOf("SEK")).toBe(2);
	});
});

describe("resolveRate", () => {
	it("answers 1 for the reporting currency itself, without a read", async () => {
		const fake = fakeDb([]);
		const rate = await resolveRate(fake.db, "USD", "usd");

		expect(rate?.rate.toNumber()).toBe(1);
		expect(rate?.origin).toBe("IDENTITY");
		expect(fake.calls).toBe(0);
	});

	it("prefers a rate entered by hand over a fetched one", async () => {
		const fake = fakeDb([
			row("1.05", RateSource.FETCHED, "frankfurter.dev"),
			row("1.20", RateSource.MANUAL),
		]);

		const rate = await resolveRate(fake.db, "USD", "EUR");

		expect(rate?.rate.toNumber()).toBe(1.2);
		expect(rate?.origin).toBe("MANUAL");
	});

	it("falls back to the fetched rate when nobody has overridden it", async () => {
		const fake = fakeDb([row("1.05", RateSource.FETCHED, "frankfurter.dev")]);
		const rate = await resolveRate(fake.db, "USD", "EUR");

		expect(rate?.rate.toNumber()).toBe(1.05);
		expect(rate?.origin).toBe("FETCHED");
		expect(rate?.provider).toBe("frankfurter.dev");
	});

	it("is null when there is nowhere to get a rate", async () => {
		expect(await resolveRate(fakeDb([]).db, "USD", "CHF")).toBeNull();
	});

	it("refuses a nonsense rate rather than converting with it", async () => {
		expect(
			await resolveRate(fakeDb([row("0", RateSource.MANUAL)]).db, "USD", "EUR"),
		).toBeNull();
		expect(
			await resolveRate(
				fakeDb([row("-2", RateSource.MANUAL)]).db,
				"USD",
				"EUR",
			),
		).toBeNull();
	});

	it("is null for a currency that is not a currency", async () => {
		expect(await resolveRate(fakeDb([]).db, "USD", "")).toBeNull();
	});
});

describe("applyRate", () => {
	const rate = (value: string): ResolvedRate => ({
		rate: new Prisma.Decimal(value),
		asOf: new Date("2026-08-01T00:00:00.000Z"),
		origin: "FETCHED",
		provider: null,
	});

	it("converts into the reporting currency", () => {
		const converted = applyRate(new Prisma.Decimal(1000), rate("1.09"), "USD");
		expect(converted.baseAmount.toNumber()).toBe(1090);
	});

	it("rounds to the reporting currency's own decimals, not to two", () => {
		const yen = applyRate(new Prisma.Decimal(100), rate("150.555"), "JPY");
		expect(yen.baseAmount.decimalPlaces()).toBe(0);

		const dollars = applyRate(new Prisma.Decimal(1000), rate("0.0067"), "USD");
		expect(dollars.baseAmount.toNumber()).toBe(6.7);
	});

	it("carries the rate and its date onto the record, so a total is reproducible", () => {
		const converted = applyRate(new Prisma.Decimal(1), rate("1.23"), "USD");
		expect(converted.fxRate.toNumber()).toBe(1.23);
		expect(converted.fxRateAt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
		expect(converted.origin).toBe("FETCHED");
	});
});
