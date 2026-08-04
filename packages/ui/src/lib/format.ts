export function formatCount(count: number, noun: string): string {
	return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

const WELL_FORMED_CURRENCY_CODE = /^[A-Za-z]{3}$/;

function displayCurrencyCode(currency: string): string {
	return WELL_FORMED_CURRENCY_CODE.test(currency)
		? currency.toUpperCase()
		: "EUR";
}

export function formatMoney(cents: number, currency = "eur"): string {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: displayCurrencyCode(currency),
		minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
	}).format(cents / 100);
}

export function formatMoneyCompact(cents: number, currency = "eur"): string {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: displayCurrencyCode(currency),
		notation: "compact",
		maximumFractionDigits: cents % 100_000 === 0 ? 0 : 1,
	}).format(cents / 100);
}

export function formatPercent(rate: number): string {
	return new Intl.NumberFormat(undefined, {
		style: "percent",
		maximumFractionDigits: 0,
	}).format(rate);
}

const dayFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	year: "numeric",
});

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

export function toDay(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDay(value: string | null | undefined): Date | undefined {
	if (!value) return undefined;
	const [year, month, day] = value.slice(0, 10).split("-").map(Number);
	if (!year || !month || !day) return undefined;
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDay(value: string | null | undefined): string {
	const date = fromDay(value);
	return date ? dayFormat.format(date) : (value ?? "—");
}

export function relativeTimeFromIso(iso: string | null | undefined): string {
	if (!iso) return "—";
	const then = new Date(iso).getTime();
	if (!Number.isFinite(then)) return "—";
	const diff = Date.now() - then;
	const abs = Math.abs(diff);
	const min = 60_000;
	const hour = 60 * min;
	const day = 24 * hour;
	if (abs < min) return "just now";
	const distance =
		abs < hour
			? `${Math.round(abs / min)}m`
			: abs < day
				? `${Math.round(abs / hour)}h`
				: abs < 30 * day
					? `${Math.round(abs / day)}d`
					: null;
	if (distance === null) {
		return new Date(iso).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	}
	return diff < 0 ? `in ${distance}` : `${distance} ago`;
}

export function initialsFromName(name: string | null | undefined): string {
	const parts = (name ?? "").split(/\s+/).filter(Boolean);
	const first = parts[0];
	if (!first) return "?";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	const last = parts[parts.length - 1] ?? first;
	return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}
