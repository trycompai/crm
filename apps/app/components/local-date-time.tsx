"use client";

import { useId } from "react";
import { InlineScript } from "./inline-script";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const relativeDateFormatter = new Intl.RelativeTimeFormat(undefined, {
	numeric: "auto",
});
const LOCAL_DAY_OPTIONS = {
	month: "short",
	day: "numeric",
	year: "numeric",
} as const;

export function LocalDateTime({
	date,
	options,
}: {
	date: string;
	options: Intl.DateTimeFormatOptions;
}) {
	const id = useId();
	const formatter = getDateTimeFormatter(options);

	return (
		<>
			<time id={id} dateTime={date} suppressHydrationWarning>
				{formatter.format(new Date(date))}
			</time>
			<InlineScript html={dateScript(id, date, options)} />
		</>
	);
}

export function LocalDateTimeRange({
	start,
	end,
	options,
}: {
	start: string;
	end: string;
	options: Intl.DateTimeFormatOptions;
}) {
	const id = useId();
	const formatter = getDateTimeFormatter(options);

	return (
		<>
			<time id={id} dateTime={start} suppressHydrationWarning>
				{formatter.formatRange(new Date(start), new Date(end))}
			</time>
			<InlineScript html={dateRangeScript(id, start, end, options)} />
		</>
	);
}

export function LocalRelativeDate({ date }: { date: string }) {
	const id = useId();

	return (
		<>
			<time id={id} dateTime={date} suppressHydrationWarning>
				{formatRelativeDate(date)}
			</time>
			<InlineScript html={relativeDateScript(id, date)} />
		</>
	);
}

export function LocalRelativeTime({ date }: { date: string }) {
	const id = useId();

	return (
		<>
			<time id={id} dateTime={date} suppressHydrationWarning>
				{formatRelativeTime(date)}
			</time>
			<InlineScript html={relativeTimeScript(id, date)} />
		</>
	);
}

export function LocalDay({ date }: { date: string }) {
	const id = useId();
	const day = date.slice(0, 10);

	return (
		<>
			<time id={id} dateTime={day} suppressHydrationWarning>
				{getDateTimeFormatter(LOCAL_DAY_OPTIONS).format(dayDate(day))}
			</time>
			<InlineScript html={dayScript(id, day, LOCAL_DAY_OPTIONS)} />
		</>
	);
}

function dateScript(
	id: string,
	date: string,
	options: Intl.DateTimeFormatOptions,
): string {
	return `{var n=document.getElementById(${json(id)});if(n)n.textContent=new Intl.DateTimeFormat(void 0,${json(options)}).format(new Date(${json(date)}))}`;
}

function dateRangeScript(
	id: string,
	start: string,
	end: string,
	options: Intl.DateTimeFormatOptions,
): string {
	return `{var n=document.getElementById(${json(id)});if(n)n.textContent=new Intl.DateTimeFormat(void 0,${json(options)}).formatRange(new Date(${json(start)}),new Date(${json(end)}))}`;
}

function relativeDateScript(id: string, date: string): string {
	return `{var n=document.getElementById(${json(id)});if(n){var d=Math.round((Date.now()-new Date(${json(date)}).getTime())/${DAY_MS});n.textContent=new Intl.RelativeTimeFormat(void 0,{numeric:"auto"}).format(-d,"day")}}`;
}

function relativeTimeScript(id: string, date: string): string {
	return `{var n=document.getElementById(${json(id)}),t=new Date(${json(date)}).getTime();if(n&&Number.isFinite(t)){var d=Date.now()-t,a=Math.abs(d),v=a<${MINUTE_MS}?"just now":a<${HOUR_MS}?Math.round(a/${MINUTE_MS})+"m":a<${DAY_MS}?Math.round(a/${HOUR_MS})+"h":a<${30 * DAY_MS}?Math.round(a/${DAY_MS})+"d":new Intl.DateTimeFormat(void 0,{month:"short",day:"numeric"}).format(new Date(t));n.textContent=a<${30 * DAY_MS}&&a>=${MINUTE_MS}?(d<0?"in "+v:v+" ago"):v}}`;
}

function dayScript(
	id: string,
	day: string,
	options: Intl.DateTimeFormatOptions,
): string {
	return `{var n=document.getElementById(${json(id)});if(n)n.textContent=new Intl.DateTimeFormat(void 0,${json(options)}).format(new Date(${json(`${day}T00:00:00`)}))}`;
}

function formatRelativeDate(date: string): string {
	const days = Math.round((Date.now() - new Date(date).getTime()) / DAY_MS);
	return relativeDateFormatter.format(-days, "day");
}

function formatRelativeTime(date: string): string {
	const then = new Date(date).getTime();
	if (!Number.isFinite(then)) return "—";
	const difference = Date.now() - then;
	const absolute = Math.abs(difference);
	if (absolute < MINUTE_MS) return "just now";
	if (absolute >= 30 * DAY_MS) {
		return getDateTimeFormatter({ month: "short", day: "numeric" }).format(
			new Date(then),
		);
	}

	const distance =
		absolute < HOUR_MS
			? `${Math.round(absolute / MINUTE_MS)}m`
			: absolute < DAY_MS
				? `${Math.round(absolute / HOUR_MS)}h`
				: `${Math.round(absolute / DAY_MS)}d`;
	return difference < 0 ? `in ${distance}` : `${distance} ago`;
}

function dayDate(day: string): Date {
	return new Date(`${day}T00:00:00`);
}

function getDateTimeFormatter(
	options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	const key = JSON.stringify(options);
	const cached = dateTimeFormatters.get(key);
	if (cached) {
		return cached;
	}

	const formatter = new Intl.DateTimeFormat(undefined, options);
	dateTimeFormatters.set(key, formatter);
	return formatter;
}

function json(value: unknown): string {
	return JSON.stringify(value).replaceAll("<", "\\u003c");
}
