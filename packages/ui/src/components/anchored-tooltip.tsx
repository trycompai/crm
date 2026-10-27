"use client";

import { TooltipContent } from "@crm/ui/components/tooltip";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";
import { createPortal } from "react-dom";

export type TooltipAnchor = {
	top: number;
	left: number;
	width: number;
	height: number;
};

function AnchoredTooltipContent({
	anchor,
	children,
	...props
}: React.ComponentProps<typeof TooltipContent> & {
	anchor: TooltipAnchor | undefined;
}) {
	if (!anchor) return null;

	return (
		<>
			{createPortal(
				<TooltipPrimitive.Trigger asChild>
					<span
						aria-hidden
						data-slot="tooltip-anchor"
						className="pointer-events-none fixed"
						style={anchor}
					/>
				</TooltipPrimitive.Trigger>,
				document.body,
			)}
			<TooltipContent {...props}>{children}</TooltipContent>
		</>
	);
}

export { AnchoredTooltipContent };
