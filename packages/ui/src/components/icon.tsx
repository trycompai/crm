import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

export const ICON_MOTIONS = [
	"pop",
	"scale",
	"lift",
	"turn",
	"rotate",
	"flip",
	"spin",
	"wiggle",
	"swing",
	"bounce",
	"pulse",
	"nudge-right",
	"nudge-left",
	"nudge-up",
	"nudge-down",
	"launch",
	"none",
] as const;

export type IconMotion = (typeof ICON_MOTIONS)[number];

export type IconComponentProps = React.SVGProps<SVGSVGElement> & {
	size?: number | string;
};

export type IconComponent = React.ComponentType<IconComponentProps> & {
	displayName?: string;
};

const MOTION_BY_ICON = new Map(
	Object.entries({
		ArrowRight: "nudge-right",
		ChevronRight: "nudge-right",
		LogOut: "nudge-right",
		ArrowLeft: "nudge-left",
		ChevronLeft: "nudge-left",
		ArrowUp: "nudge-up",
		ArrowDown: "nudge-down",
		ChevronDown: "nudge-down",
		Download: "bounce",
		ExternalLink: "launch",
		ArrowUpRight: "launch",
		Settings: "spin",
		RefreshCw: "spin",
		Plus: "turn",
		X: "turn",
		Trash: "wiggle",
		Lock: "wiggle",
		Search: "wiggle",
		TriangleAlert: "wiggle",
		Info: "pulse",
		CircleAlert: "pulse",
		Shield: "pulse",
		Sun: "pulse",
		Moon: "swing",
		ChevronUp: "nudge-up",
		Play: "nudge-right",
		WandSparkles: "wiggle",
	} satisfies Record<string, IconMotion>),
);

export function iconMotionFor(icon: IconComponent): IconMotion {
	const name = icon.displayName;

	return (name && MOTION_BY_ICON.get(name)) || "pop";
}

export type IconProps = IconComponentProps & {
	icon: IconComponent;
	motion?: IconMotion;
	tone?: "default" | "muted" | "destructive" | "success";
	size?: number | string;
};

const ICON_SIZES = {
	xs: "size-3",
	sm: "size-3.5",
	md: "size-4",
	lg: "size-5",
} as const;

const ICON_SIZE_CLASSES = new Map(Object.entries(ICON_SIZES));

export function Icon({
	icon: Glyph,
	motion,
	tone = "default",
	size,
	className,
	...props
}: IconProps) {
	const resolved = motion ?? iconMotionFor(Glyph);
	const sizeClass =
		typeof size === "string" ? ICON_SIZE_CLASSES.get(size) : undefined;

	return (
		<Glyph
			aria-hidden
			focusable={false}
			width={sizeClass ? undefined : (size ?? 16)}
			height={sizeClass ? undefined : (size ?? 16)}
			{...props}
			size={sizeClass ? undefined : (size ?? 16)}
			data-motion={resolved}
			className={cn(
				"ds-icon",
				tone === "muted" && "text-muted-foreground",
				tone === "destructive" && "text-destructive",
				tone === "success" && "text-status-success",
				sizeClass,
				className,
			)}
		/>
	);
}
