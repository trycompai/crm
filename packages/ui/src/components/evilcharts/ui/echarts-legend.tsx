"use client";
import type { CSSProperties } from "react";
import {
	type ChartConfig,
	getColorsCount,
	indicatorBackground,
} from "./echarts-chart";
export type LegendVariant =
	| "square"
	| "circle"
	| "circle-outline"
	| "rounded-square"
	| "rounded-square-outline"
	| "vertical-bar"
	| "horizontal-bar";
export function legendFillStyle(
	key: string,
	colorsCount: number,
): CSSProperties {
	if (colorsCount <= 1) return { backgroundColor: `var(--color-${key}-0)` };
	return { background: indicatorBackground(key, colorsCount) };
}
export function legendOutlineStyle(
	key: string,
	colorsCount: number,
): CSSProperties {
	const mask: CSSProperties = {
		WebkitMask:
			"linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
		WebkitMaskComposite: "xor",
		mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
		maskComposite: "exclude",
	};
	return { ...legendFillStyle(key, colorsCount), ...mask };
}
export function LegendIndicator({
	variant,
	dataKey,
	colorsCount,
}: {
	variant: LegendVariant;
	dataKey: string;
	colorsCount: number;
}) {
	const fill = legendFillStyle(dataKey, colorsCount);
	const outline = legendOutlineStyle(dataKey, colorsCount);
	switch (variant) {
		case "square":
			return <div className="h-2 w-2 shrink-0" style={fill} />;
		case "circle":
			return <div className="h-2 w-2 shrink-0 rounded-full" style={fill} />;
		case "circle-outline":
			return (
				<div
					className="h-2.5 w-2.5 shrink-0 rounded-full p-[1.5px]"
					style={outline}
				/>
			);
		case "vertical-bar":
			return <div className="h-3 w-1 shrink-0 rounded-[2px]" style={fill} />;
		case "horizontal-bar":
			return <div className="h-1 w-3 shrink-0 rounded-[2px]" style={fill} />;
		case "rounded-square-outline":
			return (
				<div
					className="h-2.5 w-2.5 shrink-0 rounded-[3px] p-[1.5px]"
					style={outline}
				/>
			);
		default:
			return <div className="h-2 w-2 shrink-0 rounded-[2px]" style={fill} />;
	}
}
type LegendOverlayProps = {
	seriesKeys: string[];
	config: ChartConfig;
	variant: LegendVariant;
	align: "left" | "center" | "right";
	verticalAlign: "top" | "middle" | "bottom";
	selectedKey: string | null;
	hoveredKey: string | null;
	isClickable: boolean;
	onToggle: (key: string) => void;
	style: CSSProperties;
};
export function LegendOverlay({
	seriesKeys,
	config,
	variant,
	align,
	selectedKey,
	hoveredKey,
	isClickable,
	onToggle,
	style,
}: LegendOverlayProps) {
	const legendJustify =
		align === "left"
			? "justify-start"
			: align === "center"
				? "justify-center"
				: "justify-end";
	return (
		<div
			style={style}
			className={`flex items-center gap-4 select-none ${legendJustify}`}
		>
			{seriesKeys.map((key) => {
				const item = config[key];
				const colorsCount = item ? getColorsCount(item) : 1;
				const isSelected =
					(selectedKey === null || selectedKey === key) &&
					(hoveredKey === null || hoveredKey === key);
				return (
					<button
						type="button"
						disabled={!isClickable}
						aria-pressed={isClickable ? selectedKey === key : undefined}
						key={key}
						className={`flex items-center gap-1.5 transition-opacity ${!isSelected ? "opacity-30" : ""} ${isClickable ? "cursor-pointer" : ""}`}
						onClick={() => {
							if (isClickable) onToggle(key);
						}}
					>
						<LegendIndicator
							variant={variant}
							dataKey={key}
							colorsCount={colorsCount}
						/>
						{item?.label ?? key}
					</button>
				);
			})}
		</div>
	);
}
