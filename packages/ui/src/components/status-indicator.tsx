import { Spinner } from "@crm/ui/components/spinner";
import { type Bloom, bloomClass } from "@crm/ui/lib/dither";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

export type StatusTone =
	| "neutral"
	| "primary"
	| "info"
	| "success"
	| "warning"
	| "error";

export type StatusSize = "default" | "sm";

const SIZE_CLASS: Record<StatusSize, string> = {
	default: "",
	sm: "text-xs",
};

const TONE_COLOR: Record<StatusTone, string> = {
	neutral: "var(--color-muted-foreground)",
	primary: "var(--color-primary)",
	info: "var(--color-info)",
	success: "var(--color-success)",
	warning: "var(--color-warning)",
	error: "var(--color-destructive)",
};

function IndicatorDot({
	tone = "neutral",
	color,
	pulse = false,
	bloom = "low",
	className,
	style,
	...props
}: React.ComponentProps<"span"> & {
	tone?: StatusTone;
	color?: string;
	pulse?: boolean;
	bloom?: Bloom;
}) {
	const resolved = color ?? TONE_COLOR[tone];

	return (
		<span
			data-slot="indicator-dot"
			data-tone={tone}
			className={cn(
				"inline-block size-1.5 shrink-0",
				pulse && "animate-pulse",
				bloomClass(bloom),
				className,
			)}
			style={
				{
					backgroundColor: resolved,
					"--bloom-color": resolved,
					...style,
				} as React.CSSProperties
			}
			{...props}
		/>
	);
}

function StatusIndicator({
	tone = "neutral",
	color,
	label,
	pulse = false,
	busy = false,
	bloom = "low",
	size = "default",
	className,
	...props
}: Omit<React.ComponentProps<"span">, "color"> & {
	tone?: StatusTone;
	color?: string;
	label: React.ReactNode;
	pulse?: boolean;
	busy?: boolean;
	bloom?: Bloom;
	size?: StatusSize;
}) {
	return (
		<span
			data-slot="status-indicator"
			data-tone={tone}
			className={cn(
				"inline-flex min-w-0 items-center gap-2 text-muted-foreground",
				SIZE_CLASS[size],
				className,
			)}
			{...props}
		>
			{busy ? (
				<Spinner className="size-3 shrink-0" />
			) : (
				<IndicatorDot
					tone={tone}
					color={color}
					pulse={pulse}
					bloom={bloom}
					aria-hidden="true"
				/>
			)}
			<span className="truncate">{label}</span>
		</span>
	);
}

export { IndicatorDot, StatusIndicator, TONE_COLOR };
