import type { TooltipComponentOption } from "echarts/components";
import { indicatorBackground, type ResolvedColors } from "./echarts-chart";
import { ECHARTS_CONFIG } from "./echarts-config";
export type TooltipVariant = "default" | "frosted-glass";
export type TooltipRoundness = "sm" | "md" | "lg" | "xl";
export type TooltipPosition = "fixed" | "variable" | "bottom";
export const roundnessClass: Record<TooltipRoundness, string> = {
	sm: "rounded-sm",
	md: "rounded-md",
	lg: "rounded-lg",
	xl: "rounded-xl",
};
export const tooltipVariantClass: Record<TooltipVariant, string> = {
	default: "bg-background",
	"frosted-glass": "bg-background/50 backdrop-blur-md",
};
export function escapeTooltipText(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				character
			] ?? character,
	);
}

export function tooltipIndicatorHtml(key: string, colorsCount: number): string {
	return `<div class="h-2.5 w-2.5 shrink-0 rounded-[2px]" style="background:${escapeTooltipText(indicatorBackground(key, colorsCount))}"></div>`;
}
export function tooltipRow({
	indicatorHtml,
	labelText,
	valueText,
	dimmed,
}: {
	indicatorHtml: string;
	labelText: string;
	valueText: string;
	dimmed: string;
}): string {
	return `<div class="flex w-full items-center gap-2 whitespace-nowrap${dimmed}">
          ${indicatorHtml}
          <div class="flex flex-1 items-center justify-between gap-4 leading-none">
            <span class="text-muted-foreground">${escapeTooltipText(labelText)}</span>
            <span class="text-foreground font-mono font-medium tabular-nums">${escapeTooltipText(valueText)}</span>
          </div>
        </div>`;
}
export function tooltipShell({
	label,
	body,
	roundness,
	variant,
}: {
	label: string;
	body: string;
	roundness: TooltipRoundness;
	variant: TooltipVariant;
}): string {
	return `<div class="grid min-w-32 items-start gap-1.5 border border-border/50 px-2.5 py-1.5 text-xs shadow-xl ${roundnessClass[roundness]} ${tooltipVariantClass[variant]}">
      <div class="font-medium text-primary">${escapeTooltipText(label)}</div>
      <div class="grid gap-1.5">${body}</div>
    </div>`;
}
function clippingBounds(dom: HTMLElement): { left: number; right: number } {
	const view = dom.ownerDocument.defaultView;
	const viewportRight = view?.innerWidth ?? Number.POSITIVE_INFINITY;
	let node = dom.parentElement?.parentElement ?? null;
	while (node && view?.getComputedStyle(node).overflowX === "visible") {
		node = node.parentElement;
	}
	const rect = node?.getBoundingClientRect();
	return {
		left: Math.max(0, rect?.left ?? 0),
		right: Math.min(viewportRight, rect?.right ?? viewportRight),
	};
}
function oversizedTooltipX(
	dom: HTMLElement | object | null,
	width: number,
	viewWidth: number,
): number {
	const centered = (viewWidth - width) / 2;
	if (!dom || !("parentElement" in dom)) return centered;
	const origin = dom.parentElement?.getBoundingClientRect();
	if (!origin) return centered;
	const bounds = clippingBounds(dom);
	const inset = ECHARTS_CONFIG.tooltip.edgeInset;
	const min = bounds.left + inset - origin.left;
	const max = bounds.right - inset - width - origin.left;
	if (max < min) return min;
	return Math.min(Math.max(centered, min), max);
}
export function resolveTooltipPosition(
	position: TooltipPosition,
): TooltipComponentOption["position"] {
	if (position === "variable") return undefined;
	if (position === "bottom") {
		return (point, _params, dom, _rect, size) => {
			const [width, height] = size.contentSize;
			const [viewWidth, viewHeight] = size.viewSize;
			const y = Math.max(
				0,
				viewHeight - height - ECHARTS_CONFIG.tooltip.edgeInset,
			);
			if (width <= viewWidth) {
				return [
					Math.max(0, Math.min(point[0] - width / 2, viewWidth - width)),
					y,
				];
			}
			return [oversizedTooltipX(dom, width, viewWidth), y];
		};
	}
	return (point, _params, _dom, _rect, size) => [
		point[0] - size.contentSize[0] / 2,
		8,
	];
}
export function tooltipBaseOption(params: {
	present: boolean;
	cursor: boolean;
	tokens: ResolvedColors["tokens"];
	position: TooltipPosition;
	axisPointerColor: string;
	strokeWidth: number;
}): TooltipComponentOption {
	const { present, cursor, position, axisPointerColor, strokeWidth } = params;
	return {
		show: present,
		trigger: "axis",
		confine: true,
		displayTransition: false,
		backgroundColor: "transparent",
		borderWidth: 0,
		padding: 0,
		extraCssText: "box-shadow:none;",
		axisPointer: cursor
			? {
					type: "line",
					lineStyle: {
						color: axisPointerColor,
						width: strokeWidth,
						type: [3, 3] as [number, number],
					},
				}
			: { type: "none" },
		position: resolveTooltipPosition(position),
	};
}
