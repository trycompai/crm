export interface CurrencyMeta {
	code: string;
	name: string;
	minorUnits: number;
}

export const DEFAULT_REPORTING_CURRENCY = "USD";

const CURRENCY_LIST: readonly CurrencyMeta[] = [
	{ code: "USD", name: "US Dollar", minorUnits: 2 },
	{ code: "EUR", name: "Euro", minorUnits: 2 },
	{ code: "JPY", name: "Japanese Yen", minorUnits: 0 },
	{ code: "GBP", name: "Pound Sterling", minorUnits: 2 },
	{ code: "CNY", name: "Chinese Yuan", minorUnits: 2 },
	{ code: "AUD", name: "Australian Dollar", minorUnits: 2 },
	{ code: "CAD", name: "Canadian Dollar", minorUnits: 2 },
	{ code: "CHF", name: "Swiss Franc", minorUnits: 2 },
	{ code: "HKD", name: "Hong Kong Dollar", minorUnits: 2 },
	{ code: "SGD", name: "Singapore Dollar", minorUnits: 2 },
	{ code: "ZAR", name: "South African Rand", minorUnits: 2 },
] as const;

export const CURRENCIES = CURRENCY_LIST;

const BY_CODE = new Map(CURRENCY_LIST.map((entry) => [entry.code, entry]));

export const CURRENCY_CODES: readonly string[] = CURRENCY_LIST.map(
	(entry) => entry.code,
);

const SHAPE = /^[A-Za-z]{3}$/;

export function normalizeCurrency(value: string | null | undefined): string {
	return (value ?? "").trim().toUpperCase();
}

export function isCurrencyCode(value: string | null | undefined): boolean {
	return BY_CODE.has(normalizeCurrency(value));
}

export function currencyMeta(
	value: string | null | undefined,
): CurrencyMeta | null {
	return BY_CODE.get(normalizeCurrency(value)) ?? null;
}

export function currencyName(value: string | null | undefined): string | null {
	return currencyMeta(value)?.name ?? null;
}

export function minorUnitsOf(value: string | null | undefined): number {
	return currencyMeta(value)?.minorUnits ?? 2;
}

export function isWellFormedCurrency(
	value: string | null | undefined,
): boolean {
	return SHAPE.test((value ?? "").trim());
}
