"use client";

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
const LOCAL_DATE_TIME_SCRIPT = `{var s="time[data-local-date-kind]",f=function(n){try{var k=n.dataset.localDateKind,v=n.dataset.localDateValue,e=n.dataset.localDateEnd,o=JSON.parse(n.dataset.localDateOptions||"{}"),d=new Date(v),t=d.getTime(),x=Date.now()-t,a=Math.abs(x),r;if(k==="date-time")r=new Intl.DateTimeFormat(void 0,o).format(d);else if(k==="date-range")r=new Intl.DateTimeFormat(void 0,o).formatRange(d,new Date(e));else if(k==="day")r=new Intl.DateTimeFormat(void 0,o).format(new Date(v+"T00:00:00"));else if(k==="relative-date"){var z=new Date(),q=(Date.UTC(z.getFullYear(),z.getMonth(),z.getDate())-Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))/${DAY_MS};r=new Intl.RelativeTimeFormat(void 0,{numeric:"auto"}).format(-q,"day")}else if(!Number.isFinite(t))r="—";else if(a<${MINUTE_MS})r="just now";else if(a>=${30 * DAY_MS})r=new Intl.DateTimeFormat(void 0,{month:"short",day:"numeric"}).format(d);else{var u=a<${HOUR_MS}?Math.floor(a/${MINUTE_MS})+"m":a<${DAY_MS}?Math.floor(a/${HOUR_MS})+"h":Math.floor(a/${DAY_MS})+"d";r=x<0?"in "+u:u+" ago"}n.textContent=r}catch{}};var c=function(r){if(r.nodeType===1&&r.matches&&r.matches(s))f(r);if(r.querySelectorAll)r.querySelectorAll(s).forEach(f)};c(document);new MutationObserver(function(m){m.forEach(function(r){r.addedNodes.forEach(c)})}).observe(document.documentElement,{childList:true,subtree:true})}`;

export function LocalDateTime({
	date,
	options,
}: {
	date: string;
	options: Intl.DateTimeFormatOptions;
}) {
	return (
		<LocalTime
			kind="date-time"
			date={date}
			options={options}
			fallback={getDateTimeFormatter(options).format(new Date(date))}
		/>
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
	return (
		<LocalTime
			kind="date-range"
			date={start}
			end={end}
			options={options}
			fallback={getDateTimeFormatter(options).formatRange(
				new Date(start),
				new Date(end),
			)}
		/>
	);
}

export function LocalRelativeDate({ date }: { date: string }) {
	return (
		<LocalTime
			kind="relative-date"
			date={date}
			fallback={formatRelativeDate(date)}
		/>
	);
}

export function LocalRelativeTime({ date }: { date: string }) {
	return (
		<LocalTime
			kind="relative-time"
			date={date}
			fallback={formatRelativeTime(date)}
		/>
	);
}

export function LocalDay({ date }: { date: string }) {
	const day = date.slice(0, 10);
	return (
		<LocalTime
			kind="day"
			date={day}
			options={LOCAL_DAY_OPTIONS}
			fallback={getDateTimeFormatter(LOCAL_DAY_OPTIONS).format(dayDate(day))}
		/>
	);
}

export function LocalDateTimeHydrator() {
	return <InlineScript html={LOCAL_DATE_TIME_SCRIPT} />;
}

function LocalTime({
	kind,
	date,
	end,
	options,
	fallback,
}: {
	kind: "date-time" | "date-range" | "day" | "relative-date" | "relative-time";
	date: string;
	end?: string;
	options?: Intl.DateTimeFormatOptions;
	fallback: string;
}) {
	return (
		<time
			dateTime={date}
			data-local-date-kind={kind}
			data-local-date-value={date}
			data-local-date-end={end}
			data-local-date-options={options ? JSON.stringify(options) : undefined}
			suppressHydrationWarning
		>
			{fallback}
		</time>
	);
}

function formatRelativeDate(date: string): string {
	const now = new Date();
	const then = new Date(date);
	const days = (calendarDay(now) - calendarDay(then)) / DAY_MS;
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
			? `${Math.floor(absolute / MINUTE_MS)}m`
			: absolute < DAY_MS
				? `${Math.floor(absolute / HOUR_MS)}h`
				: `${Math.floor(absolute / DAY_MS)}d`;
	return difference < 0 ? `in ${distance}` : `${distance} ago`;
}

function calendarDay(date: Date): number {
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDate(day: string): Date {
	return new Date(`${day}T00:00:00`);
}

function getDateTimeFormatter(
	options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	const key = JSON.stringify(options);
	const cached = dateTimeFormatters.get(key);
	if (cached) return cached;

	const formatter = new Intl.DateTimeFormat(undefined, options);
	dateTimeFormatters.set(key, formatter);
	return formatter;
}
