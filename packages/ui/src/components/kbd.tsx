import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function Kbd({
	className,
	size = "default",
	variant = "default",
	...props
}: React.ComponentProps<"kbd"> & {
	size?: "default" | "sm";
	variant?: "default" | "hint";
}) {
	return (
		<kbd
			data-slot="kbd"
			data-size={size}
			data-variant={variant}
			className={cn(
				"pointer-events-none inline-flex h-5 w-fit min-w-5 select-none items-center justify-center gap-1 rounded-sm bg-background px-1 font-medium font-sans text-foreground text-xs shadow-border in-data-[slot=button]:bg-transparent in-data-[slot=input-group]:text-muted-foreground in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=button]:text-current in-data-[slot=tooltip-content]:text-background in-data-[slot=button]:shadow-none in-data-[slot=tooltip-content]:shadow-none in-data-[slot=button]:ring-1 in-data-[slot=button]:ring-current/20 dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
				size === "sm" &&
					"h-4 min-w-4 rounded-xs px-0.5 [&_svg:not([class*='size-'])]:size-2.5!",
				variant === "hint" &&
					"bg-muted/50 px-1.5 font-mono font-normal text-11 text-muted-foreground shadow-none ring-1 ring-input/60",
				className,
			)}
			{...props}
		/>
	);
}

function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="kbd-group"
			className={cn("inline-flex items-center gap-0.5", className)}
			{...props}
		/>
	);
}

export { Kbd, KbdGroup };
