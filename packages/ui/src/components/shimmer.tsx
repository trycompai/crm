"use client";

import { cn } from "@crm/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";

export function Shimmer({
	children,
	className,
	duration = 1,
}: {
	children: string;
	className?: string;
	duration?: number;
}) {
	const reduceMotion = useReducedMotion();

	if (reduceMotion) {
		return (
			<span className={cn("text-muted-foreground", className)}>{children}</span>
		);
	}

	return (
		<motion.span
			animate={{ backgroundPosition: "0% center" }}
			initial={{ backgroundPosition: "100% center" }}
			transition={{
				duration,
				ease: "linear",
				repeat: Number.POSITIVE_INFINITY,
			}}
			className={cn(
				"relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
				"[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,no-repeat]",
				className,
			)}
			style={
				{
					"--spread": `${children.length * 2}px`,
					backgroundImage:
						"var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
				} as CSSProperties
			}
		>
			{children}
		</motion.span>
	);
}
