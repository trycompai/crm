"use client";

import {
	AnchoredTooltipContent,
	type TooltipAnchor,
} from "@crm/ui/components/anchored-tooltip";
import { Tooltip } from "@crm/ui/components/tooltip";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { type PointerEvent, type ReactNode, useState } from "react";

type Hint = { element: HTMLElement; text: string; anchor: TooltipAnchor };

const CELL_TAGS: ReadonlySet<string> = new Set(["TD", "TH"]);

function isTruncated(element: HTMLElement): boolean {
	const style = getComputedStyle(element);

	return (
		(element.scrollWidth > element.clientWidth &&
			style.textOverflow === "ellipsis") ||
		(element.scrollHeight > element.clientHeight &&
			style.webkitLineClamp !== "none")
	);
}

function hintFor(target: EventTarget, container: Element): Hint | null {
	let node = target instanceof HTMLElement ? target : null;

	while (node && node !== container) {
		const text = node.textContent?.trim() ?? "";

		if (text && isTruncated(node)) {
			const { top, left, width, height } = node.getBoundingClientRect();
			return { element: node, text, anchor: { top, left, width, height } };
		}

		if (CELL_TAGS.has(node.tagName)) return null;

		node = node.parentElement;
	}

	return null;
}

export type OverflowTooltip = {
	handlers: {
		onPointerOver: (event: PointerEvent<HTMLElement>) => void;
		onPointerLeave: () => void;
	};
	tooltip: ReactNode;
};

export function useOverflowTooltip(): OverflowTooltip {
	const [hint, setHint] = useState<Hint | null>(null);

	useMountEffect(() => {
		const dismiss = () => setHint(null);
		window.addEventListener("scroll", dismiss, true);
		window.addEventListener("resize", dismiss);
		return () => {
			window.removeEventListener("scroll", dismiss, true);
			window.removeEventListener("resize", dismiss);
		};
	});

	return {
		handlers: {
			onPointerOver: (event) => {
				const next = hintFor(event.target, event.currentTarget);

				setHint((current) =>
					current?.element === next?.element ? current : next,
				);
			},
			onPointerLeave: () => setHint(null),
		},
		tooltip: (
			<Tooltip
				open={hint !== null}
				onOpenChange={(open) => {
					if (!open) setHint(null);
				}}
			>
				<AnchoredTooltipContent anchor={hint?.anchor}>
					{hint?.text}
				</AnchoredTooltipContent>
			</Tooltip>
		),
	};
}
