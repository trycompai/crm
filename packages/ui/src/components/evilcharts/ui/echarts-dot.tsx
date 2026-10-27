import type * as echarts from "echarts/core";
import { withAlpha } from "./echarts-chart";
export type DotVariant =
	| "none"
	| "default"
	| "border"
	| "colored-border"
	| "ping";
export type DotItemStyleOption = {
	color?: string | echarts.graphic.LinearGradient;
	borderColor?: string | echarts.graphic.LinearGradient;
	borderWidth?: number;
	opacity?: number;
};
export type DotStyle = {
	size: number;
	itemStyle: DotItemStyleOption;
};
export function dotItemStyle(
	variant: DotVariant,
	paint: string | echarts.graphic.LinearGradient,
	background: string,
): DotItemStyleOption {
	switch (variant) {
		case "border":
			return { color: paint, borderColor: background, borderWidth: 2 };
		case "colored-border":
			return { color: background, borderColor: paint, borderWidth: 1 };
		case "ping": {
			const halo = typeof paint === "string" ? withAlpha(paint, 0.28) : paint;
			return { color: paint, borderColor: halo, borderWidth: 10 };
		}
		case "default":
			return { color: paint, borderWidth: 0 };
		default:
			return {};
	}
}
export const DOT_SIZES: Record<DotVariant, number> = {
	none: 0,
	default: 6,
	border: 8,
	"colored-border": 6,
	ping: 8,
};
export function dotStyle(
	variant: DotVariant,
	paint: string | echarts.graphic.LinearGradient,
	background: string,
): DotStyle {
	return {
		size: DOT_SIZES[variant],
		itemStyle: dotItemStyle(variant, paint, background),
	};
}
export function sampleGradient(slots: string[], t: number): string {
	if (slots.length <= 1) return slots[0] ?? "rgba(120, 120, 120, 1)";
	const parse = (color: string) =>
		color
			.match(/rgba?\(([^)]+)\)/)?.[1]
			?.split(",")
			.map(Number) ?? [120, 120, 120, 1];
	const position = t * (slots.length - 1);
	const index = Math.min(Math.floor(position), slots.length - 2);
	const fraction = position - index;
	const [r1 = 0, g1 = 0, b1 = 0, a1 = 1] = parse(slots[index] ?? "");
	const [r2 = 0, g2 = 0, b2 = 0, a2 = 1] = parse(slots[index + 1] ?? "");
	const lerp = (from: number, to: number) => from + (to - from) * fraction;
	return `rgba(${Math.round(lerp(r1, r2))}, ${Math.round(lerp(g1, g2))}, ${Math.round(lerp(b1, b2))}, ${lerp(a1, a2).toFixed(3)})`;
}
