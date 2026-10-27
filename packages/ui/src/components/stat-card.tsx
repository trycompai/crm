import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

type TrendDirection = "up" | "down" | "neutral";

type StatDelta = {
	value: string;
	direction?: TrendDirection;
	label?: string;
};

const TREND_COLOR: Record<TrendDirection, string> = {
	up: "text-success",
	down: "text-destructive",
	neutral: "text-muted-foreground",
};

const TREND_GLYPH: Record<TrendDirection, string> = {
	up: "↑",
	down: "↓",
	neutral: "→",
};

function inferDirection(value: string): TrendDirection {
	if (value.trim().startsWith("-")) return "down";
	if (value.trim().startsWith("+")) return "up";
	return "neutral";
}

function StatDeltaText({
	delta,
	className,
}: {
	delta: StatDelta;
	className?: string;
}) {
	const direction = delta.direction ?? inferDirection(delta.value);
	return (
		<span className={cn("inline-flex items-baseline gap-1.5", className)}>
			<span
				className={cn(
					"inline-flex items-baseline gap-0.5 font-medium text-13 tabular-nums",
					TREND_COLOR[direction],
				)}
			>
				{direction !== "neutral" ? (
					<span aria-hidden>{TREND_GLYPH[direction]}</span>
				) : null}
				{delta.value}
			</span>
			{delta.label ? (
				<span className="text-muted-foreground text-13">{delta.label}</span>
			) : null}
		</span>
	);
}

function StatCard({
	label,
	value,
	delta,
	description,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"div">, "title"> & {
	label?: React.ReactNode;
	value: React.ReactNode;
	delta?: StatDelta;
	description?: React.ReactNode;
}) {
	return (
		<div
			data-slot="stat-card"
			className={cn("flex min-w-0 flex-col gap-1 p-4 md:p-6", className)}
			{...props}
		>
			{label != null ? (
				<span className="truncate text-13 text-muted-foreground">
					{label}
				</span>
			) : null}
			<div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
				<span className="font-semibold text-2xl tracking-tight tabular-nums">
					{value}
				</span>
				{delta ? <StatDeltaText delta={delta} /> : null}
			</div>
			{description ? (
				<div className="text-pretty text-muted-foreground text-13">
					{description}
				</div>
			) : null}
			{children}
		</div>
	);
}

export type { StatDelta, TrendDirection };
export { StatCard, StatDeltaText };
