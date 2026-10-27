"use client";
import { BarChart, type BarSeriesOption } from "echarts/charts";
import {
	DataZoomComponent,
	type DataZoomComponentOption,
	GridComponent,
	type GridComponentOption,
	TooltipComponent,
	type TooltipComponentOption,
} from "echarts/components";
import type { ComposeOption, ImagePatternObject } from "echarts/core";
import * as echarts from "echarts/core";
import {
	Children,
	type CSSProperties,
	type FC,
	isValidElement,
	type ReactNode,
	useCallback,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Brush,
	type BrushGeometry,
	type BrushOverlayElements,
	type BrushProps,
	type BrushRange,
	buildBrushDataZoom,
	syncBrushOverlay,
} from "../ui/echarts-brush";
import {
	buildChartCss,
	type ChartConfig,
	type ChartRow,
	DEFAULT_ECHARTS_RENDERER,
	type EChartsRenderer,
	finiteSum,
	finiteValue,
	flattenColor,
	getColorsCount,
	type ResolvedColors,
	resolveColors,
	withAlpha,
} from "../ui/echarts-chart";
import { ECHARTS_CONFIG } from "../ui/echarts-config";
import { sampleGradient } from "../ui/echarts-dot";
import { LegendOverlay, type LegendVariant } from "../ui/echarts-legend";
import {
	boundedIndex,
	cancelActiveTooltip,
	observeChartTheme,
	showActiveIndex,
	useChartLifecycle,
	useReducedMotion,
} from "../ui/echarts-lifecycle";
import { setChartOption } from "../ui/echarts-options";
import {
	type TooltipPosition,
	type TooltipRoundness,
	type TooltipVariant,
	tooltipBaseOption,
	tooltipIndicatorHtml,
	tooltipRow,
	tooltipShell,
} from "../ui/echarts-tooltip";

export type {
	ChartConfig,
	EChartsRenderer,
	LegendVariant,
	TooltipPosition,
	TooltipRoundness,
	TooltipVariant,
};

echarts.use([BarChart, GridComponent, TooltipComponent, DataZoomComponent]);
type EChartsInstance = ReturnType<typeof echarts.init>;
type EChartsOption = ComposeOption<
	| BarSeriesOption
	| GridComponentOption
	| TooltipComponentOption
	| DataZoomComponentOption
>;
type ArrayItem<T> = T extends readonly (infer U)[] ? U : T;
type XAxisOption = ArrayItem<NonNullable<EChartsOption["xAxis"]>>;
type YAxisOption = ArrayItem<NonNullable<EChartsOption["yAxis"]>>;
const {
	DEFAULT_BAR_RADIUS,
	STROKE_WIDTH,
	LOADING_ANIMATION_DURATION,
	BAR_GROW_DURATION,
	BAR_STAGGER,
	LOADING_DEFAULT_BARS,
	SELECTION_DIM,
	HOVER_BLUR,
	GLOW_BLUR,
	GLOW_OPACITY,
	EXPAND_COLLAPSED,
	EXPAND_TAU,
	BLOCK_SIZE,
	BLOCK_GAP,
	BLOCK_TRACK_OPACITY,
	STACK_SEGMENT_GAP,
	MAX_HIGHLIGHT_DIM,
	STRIPPED_CAP_HEIGHT,
	STRIPPED_BODY_ALPHA,
	STRIPPED_CAP_MAX_FRACTION,
	STRIPPED_FALLBACK_FRACTION,
	GRID_LINE_OPACITY,
	LOADING_SHIMMER_MAX_OPACITY,
	LOADING_SHIMMER_BAND,
	LOADING_SHIMMER_FEATHER,
	BRUSH_FILL_OPACITY,
	BRUSH_FILLER_OPACITY,
	GRAY,
} = ECHARTS_CONFIG.bar;

export type BarVariant =
	| "default"
	| "hatched"
	| "duotone"
	| "duotone-reverse"
	| "gradient"
	| "stripped"
	| "blocks"
	| "expandable";
export type StackType = "default" | "stacked" | "percent";
export type BarLayout = "vertical" | "horizontal";
export type BarAnimationType =
	| "none"
	| "left-to-right"
	| "right-to-left"
	| "center-out"
	| "edges-in";
export interface EChartsBarChartProps<TData extends ChartRow> {
	data: TData[];
	config: ChartConfig;
	renderer?: EChartsRenderer;
	xDataKey?: keyof TData & string;
	className?: string;
	stackType?: StackType;
	layout?: BarLayout;
	barRadius?: number;
	animation?: boolean;
	animationType?: BarAnimationType;
	barGap?: number;
	barCategoryGap?: number;
	defaultSelectedDataKey?: string | null;
	onSelectionChange?: (key: string | null) => void;
	enableMaxValueHighlight?: boolean;
	isLoading?: boolean;
	loadingBars?: number;
	chartOptions?: EChartsOption;
	activeIndex?: number | null;
	children?: ReactNode;
}
export interface BarProps {
	dataKey: string;
	variant?: BarVariant;
	radius?: number;
	animationType?: BarAnimationType;
	isClickable?: boolean;
	enableHoverHighlight?: boolean;
	glowing?: boolean;
	bufferBar?: boolean;
}
const Bar: FC<BarProps> = () => null;
export interface XAxisProps {
	dataKey?: string;
	tickFormatter?: (value: string, index: number) => string;
	label?: string;
	hideDots?: boolean;
}
const XAxis: FC<XAxisProps> = () => null;
export interface YAxisProps {
	dataKey?: string;
	tickFormatter?: (value: string, index: number) => string;
	label?: string;
	hideDots?: boolean;
}
const YAxis: FC<YAxisProps> = () => null;
const Grid: FC = () => null;
export interface TooltipProps {
	variant?: TooltipVariant;
	roundness?: TooltipRoundness;
	defaultIndex?: number;
	position?: TooltipPosition;
	valueFormatter?: (value: number) => string;
}
const Tooltip: FC<TooltipProps> = () => null;
export interface LegendProps {
	variant?: LegendVariant;
	align?: "left" | "center" | "right";
	verticalAlign?: "top" | "middle" | "bottom";
	isClickable?: boolean;
}
const Legend: FC<LegendProps> = () => null;
type BarSeriesConfig = {
	dataKey: string;
	variant: BarVariant;
	radius?: number;
	animationType?: BarAnimationType;
	isClickable: boolean;
	enableHoverHighlight: boolean;
	glowing: boolean;
	bufferBar: boolean;
};
type AxisSlot = {
	present: boolean;
	dataKey?: string;
	tickFormatter?: (value: string, index: number) => string;
	label?: string;
	hideDots: boolean;
};
type TooltipSlot = {
	valueFormatter?: (value: number) => string;
	present: boolean;
	variant: TooltipVariant;
	roundness: TooltipRoundness;
	defaultIndex?: number;
	position: TooltipPosition;
};
type LegendSlot = {
	present: boolean;
	variant: LegendVariant;
	align: "left" | "center" | "right";
	verticalAlign: "top" | "middle" | "bottom";
	isClickable: boolean;
};
type BrushSlot = {
	present: boolean;
	height?: number;
	formatLabel?: (value: string, index: number) => string;
	onChange?: (range: { startIndex: number; endIndex: number }) => void;
};
type CollectedConfig = {
	bars: BarSeriesConfig[];
	xAxis: AxisSlot;
	yAxis: AxisSlot;
	showGrid: boolean;
	tooltip: TooltipSlot;
	legend: LegendSlot;
	brush: BrushSlot;
};
function collectConfig(children: ReactNode): CollectedConfig {
	const bars: BarSeriesConfig[] = [];
	let xAxis: AxisSlot = { present: false, hideDots: false };
	let yAxis: AxisSlot = { present: false, hideDots: false };
	let showGrid = false;
	let tooltip: TooltipSlot = {
		present: false,
		variant: "default",
		roundness: "lg",
		position: "variable",
	};
	let legend: LegendSlot = {
		present: false,
		variant: "rounded-square",
		align: "right",
		verticalAlign: "top",
		isClickable: false,
	};
	let brush: BrushSlot = { present: false };
	Children.forEach(children, (child) => {
		if (!isValidElement(child)) return;
		const type = child.type;
		if (type === Bar) {
			const props = child.props as BarProps;
			bars.push({
				dataKey: props.dataKey,
				variant: props.variant ?? "default",
				radius: props.radius,
				animationType: props.animationType,
				isClickable: props.isClickable ?? false,
				enableHoverHighlight: props.enableHoverHighlight ?? false,
				glowing: props.glowing ?? false,
				bufferBar: props.bufferBar ?? false,
			});
		} else if (type === XAxis) {
			const props = child.props as XAxisProps;
			xAxis = {
				present: true,
				dataKey: props.dataKey,
				tickFormatter: props.tickFormatter,
				label: props.label,
				hideDots: props.hideDots ?? false,
			};
		} else if (type === YAxis) {
			const props = child.props as YAxisProps;
			yAxis = {
				present: true,
				dataKey: props.dataKey,
				tickFormatter: props.tickFormatter,
				label: props.label,
				hideDots: props.hideDots ?? false,
			};
		} else if (type === Grid) {
			showGrid = true;
		} else if (type === Tooltip) {
			const props = child.props as TooltipProps;
			tooltip = {
				present: true,
				variant: props.variant ?? "default",
				roundness: props.roundness ?? "lg",
				defaultIndex: props.defaultIndex,
				valueFormatter: props.valueFormatter,
				position: props.position ?? "variable",
			};
		} else if (type === Legend) {
			const props = child.props as LegendProps;
			legend = {
				present: true,
				variant: props.variant ?? "rounded-square",
				align: props.align ?? "right",
				verticalAlign: props.verticalAlign ?? "top",
				isClickable: props.isClickable ?? false,
			};
		} else if (type === Brush) {
			const props = child.props as BrushProps;
			brush = {
				present: true,
				height: props.height,
				formatLabel: props.formatLabel,
				onChange: props.onChange,
			};
		}
	});
	return { bars, xAxis, yAxis, showGrid, tooltip, legend, brush };
}

function solidVerticalPaint(
	slots: string[],
	alpha: number,
): string | echarts.graphic.LinearGradient {
	if (slots.length <= 1) {
		const base = slots[0] ?? GRAY;
		return alpha === 1 ? base : withAlpha(base, alpha);
	}
	const stops = slots.map((color, i) => ({
		offset: i / (slots.length - 1),
		color: withAlpha(color, alpha),
	}));
	return new echarts.graphic.LinearGradient(0, 0, 0, 1, stops);
}
function verticalFadePaint(slots: string[]): echarts.graphic.LinearGradient {
	const offsets = [0, 0.2, 0.45, 0.7, 0.9, 1];
	const alphaAt = (t: number) =>
		t <= 0.2 ? 1 : t >= 0.9 ? 0 : 1 - (t - 0.2) / 0.7;
	const stops = offsets.map((t) => ({
		offset: t,
		color: withAlpha(sampleGradient(slots, t), alphaAt(t)),
	}));
	return new echarts.graphic.LinearGradient(0, 0, 0, 1, stops);
}
function duotoneSplitPaint(
	base: string,
	leftAlpha: number,
	rightAlpha: number,
	isHorizontal: boolean,
): echarts.graphic.LinearGradient {
	const stops = [
		{ offset: 0, color: withAlpha(base, leftAlpha) },
		{ offset: 0.5, color: withAlpha(base, leftAlpha) },
		{ offset: 0.5, color: withAlpha(base, rightAlpha) },
		{ offset: 1, color: withAlpha(base, rightAlpha) },
	];
	return isHorizontal
		? new echarts.graphic.LinearGradient(0, 0, 0, 1, stops)
		: new echarts.graphic.LinearGradient(1, 0, 0, 0, stops);
}
function strippedDatumPaint(
	slots: string[],
	isHorizontal: boolean,
	capFraction: number,
): echarts.graphic.LinearGradient {
	const f = Math.min(Math.max(capFraction, 0), 1);
	const cap = withAlpha(sampleGradient(slots, 0), 1);
	const bodyTop = withAlpha(sampleGradient(slots, f), STRIPPED_BODY_ALPHA);
	const bodyEnd = withAlpha(sampleGradient(slots, 1), STRIPPED_BODY_ALPHA);
	const stops = [
		{ offset: 0, color: cap },
		{ offset: f, color: cap },
		{ offset: f, color: bodyTop },
		{ offset: 1, color: bodyEnd },
	];
	return isHorizontal
		? new echarts.graphic.LinearGradient(1, 0, 0, 0, stops)
		: new echarts.graphic.LinearGradient(0, 0, 0, 1, stops);
}
function strippedCapFraction(
	value: number,
	valuePxPerUnit: number | null,
): number {
	if (valuePxPerUnit == null) return STRIPPED_FALLBACK_FRACTION;
	const barPx = Math.abs(value) * valuePxPerUnit;
	if (!(barPx > 0)) return STRIPPED_FALLBACK_FRACTION;
	return Math.min(STRIPPED_CAP_HEIGHT / barPx, STRIPPED_CAP_MAX_FRACTION);
}
function measureValuePxPerUnit(
	chart: EChartsInstance,
	isHorizontal: boolean,
): number | null {
	const finder = isHorizontal ? { xAxisIndex: 0 } : { yAxisIndex: 0 };
	try {
		const p0 = chart.convertToPixel(finder, 0);
		const p1 = chart.convertToPixel(finder, 1);
		if (typeof p0 !== "number" || typeof p1 !== "number") return null;
		const delta = Math.abs(p1 - p0);
		return Number.isFinite(delta) && delta > 0 ? delta : null;
	} catch {
		return null;
	}
}
function measureBarWidthPx(
	chart: EChartsInstance,
	isHorizontal: boolean,
	barCategoryGap: number | undefined,
): number | null {
	const finder = isHorizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 };
	try {
		const p0 = chart.convertToPixel(finder, 0);
		const p1 = chart.convertToPixel(finder, 1);
		if (typeof p0 !== "number" || typeof p1 !== "number") return null;
		const pitch = Math.abs(p1 - p0);
		if (!Number.isFinite(pitch) || pitch <= 0) return null;
		const width = barCategoryGap != null ? pitch - barCategoryGap : pitch * 0.8;
		return width > 1 ? width : null;
	} catch {
		return null;
	}
}
function patternFill(
	kind: "hatched" | "buffer" | "blocks",
	color: string,
	blockSize: number = BLOCK_SIZE,
): ImagePatternObject | null {
	if (typeof document === "undefined") return null;
	const dpr = Math.max(window.devicePixelRatio || 1, 1);
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const size = (width: number, height: number) => {
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.scale(dpr, dpr);
	};
	const pattern = (rotation = 0): ImagePatternObject => ({
		image: canvas,
		repeat: "repeat",
		rotation,
		scaleX: 1 / dpr,
		scaleY: 1 / dpr,
	});
	if (kind === "blocks") {
		size(1, blockSize + BLOCK_GAP);
		ctx.fillStyle = withAlpha(color, 1);
		ctx.fillRect(0, 0, 1, blockSize);
		return pattern();
	}
	if (kind === "hatched") {
		size(5, 5);
		ctx.fillStyle = withAlpha(color, 0.3);
		ctx.fillRect(0, 0, 5, 5);
		ctx.fillStyle = withAlpha(color, 1);
		ctx.fillRect(0, 0, 1.5, 5);
		return pattern(-Math.PI / 4);
	}
	size(5, 5);
	ctx.fillStyle = withAlpha(color, 1);
	ctx.fillRect(0, 0, 1, 5);
	return pattern(-Math.PI / 4);
}
function expandableDatumPaint(
	slots: string[],
	fraction: number,
): echarts.graphic.LinearGradient {
	const base = slots[0] ?? GRAY;
	const half = Math.max(0, Math.min(1, fraction)) / 2;
	const left = 0.5 - half;
	const right = 0.5 + half;
	const clear = withAlpha(base, 0);
	return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
		{ offset: 0, color: clear },
		{ offset: left, color: clear },
		{ offset: left, color: base },
		{ offset: right, color: base },
		{ offset: right, color: clear },
		{ offset: 1, color: clear },
	]);
}
function barFillPaint(
	variant: BarVariant,
	slots: string[],
	isHorizontal: boolean,
	blockSize: number = BLOCK_SIZE,
): string | echarts.graphic.LinearGradient | ImagePatternObject {
	const base = slots[0] ?? GRAY;
	switch (variant) {
		case "gradient":
			return verticalFadePaint(slots);
		case "duotone":
			return duotoneSplitPaint(base, 0.4, 1, isHorizontal);
		case "duotone-reverse":
			return duotoneSplitPaint(base, 1, 0.4, isHorizontal);
		case "hatched":
			return patternFill("hatched", base) ?? solidVerticalPaint(slots, 1);
		case "blocks":
			return (
				patternFill("blocks", base, blockSize) ?? solidVerticalPaint(slots, 1)
			);
		case "expandable":
			return expandableDatumPaint(slots, EXPAND_COLLAPSED);
		case "stripped":
			return strippedDatumPaint(
				slots,
				isHorizontal,
				STRIPPED_FALLBACK_FRACTION,
			);
		default:
			return solidVerticalPaint(slots, 1);
	}
}
function barBorderRadius(
	radius: number,
	variant: BarVariant,
	isHorizontal: boolean,
): number | number[] {
	if (variant === "blocks" || variant === "expandable") return 0;
	if (variant !== "stripped") return radius;
	return isHorizontal ? [0, radius, radius, 0] : [radius, radius, 0, 0];
}
function selectionOpacity(selected: string | null, key: string): number {
	return selected === null || selected === key ? 1 : SELECTION_DIM;
}
function barStaggerDelay(
	type: BarAnimationType,
	index: number,
	count: number,
): number {
	if (type === "none" || count <= 0) return 0;
	const last = count - 1;
	const center = last / 2;
	let step: number;
	switch (type) {
		case "right-to-left":
			step = last - index;
			break;
		case "center-out":
			step = Math.abs(index - center);
			break;
		case "edges-in":
			step = center - Math.abs(index - center);
			break;
		default:
			step = index;
	}
	return step * BAR_STAGGER;
}
type OptionBuildContext = {
	data: ChartRow[];
	config: ChartConfig;
	bars: BarSeriesConfig[];
	seriesKeys: string[];
	animationType: BarAnimationType;
	barRadius: number;
	isHorizontal: boolean;
	isStacked: boolean;
	isPercent: boolean;
	selectedDataKey: string | null;
	hasSelection: boolean;
	showGrid: boolean;
	categorySlot: AxisSlot;
	valueSlot: AxisSlot;
	tooltipSlot: TooltipSlot;
	legendSlot: LegendSlot;
	isLoading: boolean;
	loadingData: () => number[];
	showBrush: boolean;
	brushHeight: number;
	barGap?: number;
	barCategoryGap?: number;
	resolved: ResolvedColors;
	categories: string[];
	brushRange: BrushRange;
	valuePxPerUnit: number | null;
	barWidthPx: number | null;
	expand: {
		key: string | null;
		hovered: number | null;
		progress: Map<number, number>;
	};
	maxHighlightIndex: number | null;
};
function buildChartLayout({
	legendSlot,
	showBrush,
	brushHeight,
	isHorizontal,
	categorySlot,
	valueSlot,
}: OptionBuildContext): {
	grid: GridComponentOption;
	brushBottom: number;
} {
	const legendTop = legendSlot.present && legendSlot.verticalAlign === "top";
	const legendBottom =
		legendSlot.present && legendSlot.verticalAlign === "bottom";
	const bottomAxisLabel = isHorizontal ? valueSlot.label : categorySlot.label;
	const brushGap = showBrush
		? brushHeight + 30 + (bottomAxisLabel ? 22 : 0)
		: 0;
	return {
		grid: {
			left: 8,
			right: 8,
			top: legendTop ? 42 : 16,
			bottom: 8 + brushGap + (legendBottom ? 34 : 0),
		},
		brushBottom: legendBottom ? 34 : 6,
	};
}
function buildMainAxes(ctx: OptionBuildContext): {
	xAxis: XAxisOption;
	yAxis: YAxisOption;
} {
	const {
		isHorizontal,
		showGrid,
		isLoading,
		isPercent,
		categories,
		loadingData,
		categorySlot,
		valueSlot,
	} = ctx;
	const { tokens } = ctx.resolved;
	const axisLabelColor = tokens.mutedForeground;
	const splitLineColor = withAlpha(tokens.border, GRID_LINE_OPACITY);
	const tickDotColor = flattenColor(splitLineColor, tokens.background);
	const catData = isLoading ? loadingData().map((_, i) => i) : categories;
	const catFormatter = categorySlot.tickFormatter;
	const valFormatter = valueSlot.tickFormatter;
	const categoryNameGap = isHorizontal ? 38 : 30;
	const valueNameGap = isHorizontal ? 30 : 38;
	const categoryAxis = {
		type: "category" as const,
		boundaryGap: true,
		show: true,
		inverse: isHorizontal,
		data: catData,
		name: isLoading ? undefined : categorySlot.label,
		nameLocation: "middle" as const,
		nameGap: categoryNameGap,
		nameTextStyle: { color: axisLabelColor, fontSize: 10 },
		axisLine: { show: false },
		axisTick: {
			show: !isLoading && categorySlot.present && !categorySlot.hideDots,
			length: 0.5,
			alignWithLabel: true,
			lineStyle: { color: tickDotColor, width: 3, cap: "round" as const },
		},
		splitLine: { show: false },
		axisLabel: {
			show: !isLoading && categorySlot.present,
			color: axisLabelColor,
			fontSize: 10,
			margin: 8,
			formatter: catFormatter
				? (value: string, index: number) => catFormatter(value, index)
				: undefined,
		},
	};
	const valueAxis = {
		type: "value" as const,
		show: valueSlot.present || showGrid,
		max: isPercent ? 1 : undefined,
		name: isLoading ? undefined : valueSlot.label,
		nameLocation: "middle" as const,
		nameGap: valueNameGap,
		nameTextStyle: { color: axisLabelColor, fontSize: 10 },
		axisLine: { show: false },
		axisTick: {
			show: valueSlot.present && !isLoading && !valueSlot.hideDots,
			length: 0.5,
			lineStyle: { color: tickDotColor, width: 3, cap: "round" as const },
		},
		splitLine: {
			show: showGrid && !isLoading,
			lineStyle: {
				color: splitLineColor,
				type: [3, 3] as [number, number],
				width: 1,
			},
		},
		axisLabel: {
			show: valueSlot.present && !isLoading,
			color: axisLabelColor,
			fontSize: 10,
			margin: 8,
			formatter: isPercent
				? (value: number) => `${Math.round(value * 100)}%`
				: valFormatter
					? (value: number, index: number) => valFormatter(String(value), index)
					: undefined,
		},
	};
	return isHorizontal
		? { xAxis: valueAxis, yAxis: categoryAxis }
		: { xAxis: categoryAxis, yAxis: valueAxis };
}
function createTooltipFormatter(ctx: OptionBuildContext) {
	const { config, selectedDataKey, tooltipSlot } = ctx;
	return (params: unknown): string => {
		const rows = Array.isArray(params) ? params : [params];
		if (!rows.length) return "";
		const first = rows[0] as {
			axisValue?: string | number;
			name?: string;
		};
		const axisValue = first.axisValue ?? first.name ?? "";
		const label = String(axisValue);
		const body = rows
			.map((param) => {
				const p = param as {
					seriesId?: string;
					seriesName?: string;
					value?: number | string | null;
				};
				if (String(p.seriesId ?? "").startsWith("__")) return "";
				if (p.value == null) return "";
				const key = p.seriesId ?? p.seriesName ?? "";
				const item = config[key];
				const colorsCount = item ? getColorsCount(item) : 1;
				const labelText =
					typeof item?.label === "string" ? item.label : (p.seriesName ?? key);
				const dimmed =
					selectedDataKey != null && selectedDataKey !== key
						? " opacity-30"
						: "";
				const value =
					typeof p.value === "number"
						? (tooltipSlot.valueFormatter?.(p.value) ??
							p.value.toLocaleString())
						: String(p.value ?? "");
				return tooltipRow({
					indicatorHtml: tooltipIndicatorHtml(key, colorsCount),
					labelText,
					valueText: value,
					dimmed,
				});
			})
			.join("");
		return tooltipShell({
			label,
			body,
			roundness: tooltipSlot.roundness,
			variant: tooltipSlot.variant,
		});
	};
}
function buildTooltipOption(ctx: OptionBuildContext): TooltipComponentOption {
	const { tooltipSlot, isLoading } = ctx;
	const { tokens } = ctx.resolved;
	return {
		...tooltipBaseOption({
			present: tooltipSlot.present && !isLoading,
			cursor: false,
			tokens,
			position: tooltipSlot.position,
			axisPointerColor: tokens.border,
			strokeWidth: STROKE_WIDTH,
		}),
		formatter: createTooltipFormatter(ctx),
	};
}
function buildBrushOption(
	ctx: OptionBuildContext,
	brushBottom: number,
): {
	miniGrid: GridComponentOption;
	miniXAxis: XAxisOption;
	miniYAxis: YAxisOption;
	miniSeries: BarSeriesOption[];
	dataZoom: DataZoomComponentOption[];
} {
	const {
		data,
		bars,
		isStacked,
		selectedDataKey,
		hasSelection,
		brushHeight,
		categories,
	} = ctx;
	const { tokens } = ctx.resolved;
	const miniGrid: GridComponentOption = {
		left: 8,
		right: 8,
		bottom: brushBottom,
		height: brushHeight,
		outerBoundsMode: "none",
	};
	const miniXAxis: XAxisOption = {
		type: "category",
		gridIndex: 1,
		boundaryGap: true,
		show: false,
		data: categories,
		axisPointer: { show: false },
	};
	const miniYAxis: YAxisOption = { type: "value", gridIndex: 1, show: false };
	const miniSeries: BarSeriesOption[] = bars.map((bar) => {
		const key = bar.dataKey;
		const base = (ctx.resolved.series[key] ?? [])[0] ?? GRAY;
		const dim = hasSelection && selectedDataKey !== key ? SELECTION_DIM : 1;
		return {
			id: `__mini-${key}`,
			type: "bar",
			xAxisIndex: 1,
			yAxisIndex: 1,
			data: data.map((row) => finiteValue(row[key])),
			stack: isStacked ? "__mini-total" : undefined,
			silent: true,
			barCategoryGap: "20%",
			emphasis: { disabled: true },
			tooltip: { show: false },
			itemStyle: {
				color: base,
				opacity: BRUSH_FILL_OPACITY * dim,
				borderRadius: 1,
			},
			z: 0,
			animation: false,
		};
	});
	const dataZoom = buildBrushDataZoom({
		brushBottom,
		brushHeight,
		brushRange: ctx.brushRange,
		fillerColor: withAlpha(tokens.foreground, BRUSH_FILLER_OPACITY),
	});
	return { miniGrid, miniXAxis, miniYAxis, miniSeries, dataZoom };
}
function buildLoadingOption(
	ctx: OptionBuildContext,
	frame: {
		grid: GridComponentOption;
		xAxis: XAxisOption;
		yAxis: YAxisOption;
	},
): EChartsOption {
	const { tokens } = ctx.resolved;
	return {
		animation: false,
		grid: frame.grid,
		xAxis: frame.xAxis,
		yAxis: frame.yAxis,
		tooltip: { show: false },
		series: [
			{
				id: "__loading",
				type: "bar",
				data: ctx.loadingData(),
				barCategoryGap: "30%",
				silent: true,
				itemStyle: {
					color: withAlpha(tokens.foreground, 0),
					borderRadius: barBorderRadius(
						DEFAULT_BAR_RADIUS,
						"default",
						ctx.isHorizontal,
					),
				},
				z: 1,
			},
		],
	};
}
function buildBarSeries(ctx: OptionBuildContext): BarSeriesOption[] {
	const {
		data,
		config,
		bars,
		seriesKeys,
		animationType,
		isHorizontal,
		isStacked,
		isPercent,
		selectedDataKey,
		hasSelection,
		barGap,
		barCategoryGap,
		resolved,
	} = ctx;
	const lastIndex = data.length - 1;
	const rowTotals = isPercent
		? data.map((row) =>
				finiteSum(seriesKeys.map((key) => finiteValue(row[key]) ?? 0)),
			)
		: [];
	const series: BarSeriesOption[] = bars.map((bar) => {
		const key = bar.dataKey;
		const slots = resolved.series[key] ?? [GRAY];
		const base = slots[0] ?? GRAY;
		const isSelected = selectedDataKey === key;
		const dim = selectionOpacity(selectedDataKey, key);
		const resolvedRadius = bar.radius ?? ctx.barRadius;
		const borderRadius = barBorderRadius(
			resolvedRadius,
			bar.variant,
			isHorizontal,
		);
		const blockSize = ctx.barWidthPx ?? BLOCK_SIZE;
		const fill = barFillPaint(bar.variant, slots, isHorizontal, blockSize);
		const barAnim = bar.animationType ?? animationType;
		const isStripped = bar.variant === "stripped";
		const isExpandable = bar.variant === "expandable";
		const mutedFill = withAlpha(
			resolved.tokens.mutedForeground,
			MAX_HIGHLIGHT_DIM,
		);
		const isMuted = (i: number) =>
			ctx.maxHighlightIndex != null && i !== ctx.maxHighlightIndex;
		const expandOf = (i: number) =>
			ctx.expand.key === key
				? (ctx.expand.progress.get(i) ?? EXPAND_COLLAPSED)
				: EXPAND_COLLAPSED;
		const expandHovered = ctx.expand.key === key ? ctx.expand.hovered : null;
		const isBlocks = bar.variant === "blocks";
		const blockTrack = isBlocks
			? patternFill(
					"blocks",
					withAlpha(resolved.tokens.mutedForeground, BLOCK_TRACK_OPACITY),
					blockSize,
				)
			: null;
		const values = data.map((row, i) => {
			const value = finiteValue(row[key]);
			if (value === null) return null;
			if (!isPercent) return value;
			const total = rowTotals[i];
			return total ? value / total : 0;
		});
		const bufferStyle = bar.bufferBar
			? {
					color: patternFill("buffer", base) ?? "transparent",
					borderColor: base,
					borderWidth: STROKE_WIDTH,
					borderRadius,
				}
			: null;
		const glowAt = (i: number) => ({
			shadowBlur: GLOW_BLUR,
			shadowColor: withAlpha(
				sampleGradient(slots, values.length > 1 ? i / (values.length - 1) : 0),
				GLOW_OPACITY,
			),
		});
		const glowFor = bar.glowing
			? glowAt
			: ctx.maxHighlightIndex != null
				? (i: number) => (i === ctx.maxHighlightIndex ? glowAt(i) : {})
				: null;
		const dataPoints =
			isStripped ||
			isExpandable ||
			glowFor ||
			ctx.maxHighlightIndex != null ||
			(bufferStyle && lastIndex >= 0)
				? values.map((value, i) => {
						if (value === null) return null;
						const isBuffer = !!bufferStyle && i === lastIndex;
						if (
							!isBuffer &&
							!glowFor &&
							!isStripped &&
							!isExpandable &&
							!isMuted(i)
						)
							return value;
						return {
							value,
							...(isExpandable ? { label: { show: i === expandHovered } } : {}),
							itemStyle: {
								...(isStripped && !isBuffer
									? {
											color: strippedDatumPaint(
												slots,
												isHorizontal,
												strippedCapFraction(value, ctx.valuePxPerUnit),
											),
										}
									: {}),
								...(isExpandable && !isBuffer
									? { color: expandableDatumPaint(slots, expandOf(i)) }
									: {}),
								...(isBuffer && bufferStyle ? bufferStyle : {}),
								...(glowFor ? glowFor(i) : {}),
								...(isMuted(i) ? { color: mutedFill } : {}),
							},
						};
					})
				: values;
		return {
			id: key,
			name: typeof config[key]?.label === "string" ? config[key]?.label : key,
			type: "bar",
			data: dataPoints,
			stack: isStacked ? "total" : undefined,
			barGap,
			barCategoryGap,
			cursor: bar.isClickable ? "pointer" : "default",
			z: isSelected ? 3 : hasSelection ? 1 : 2,
			label: isExpandable
				? {
						show: false,
						position: "top",
						color: resolved.tokens.foreground,
						fontFamily: "var(--font-mono, monospace)",
						fontSize: 11,
					}
				: undefined,
			showBackground: isBlocks,
			backgroundStyle: blockTrack
				? { color: blockTrack, borderRadius }
				: undefined,
			itemStyle: {
				color: fill,
				borderRadius,
				opacity: dim,
			},
			emphasis:
				bar.enableHoverHighlight && !hasSelection
					? { focus: "self" as const, blurScope: "coordinateSystem" as const }
					: { disabled: true },
			blur:
				bar.enableHoverHighlight && !hasSelection
					? { itemStyle: { opacity: HOVER_BLUR } }
					: undefined,
			animationDuration: BAR_GROW_DURATION,
			animationEasing: "cubicOut",
			animationDelay: (idx: number) =>
				barStaggerDelay(barAnim, idx, data.length),
		};
	});
	const gapUnits =
		(isStacked || isPercent) && series.length > 1 && ctx.valuePxPerUnit
			? STACK_SEGMENT_GAP / ctx.valuePxPerUnit
			: 0;
	if (!gapUnits) return series;
	const spaced: BarSeriesOption[] = [];
	series.forEach((entry, i) => {
		spaced.push(entry);
		if (i === series.length - 1) return;
		spaced.push({
			id: `__stackgap-${i}`,
			type: "bar",
			stack: isStacked ? "total" : undefined,
			data: data.map(() => gapUnits),
			itemStyle: { color: "transparent" },
			silent: true,
			tooltip: { show: false },
			legendHoverLink: false,
			emphasis: { disabled: true },
			animation: false,
			z: 1,
		});
	});
	return spaced;
}
type LiveState = {
	resolved: ResolvedColors | null;
	hasRevealed: boolean;
	revealEndsAt: number;
	valuePxPerUnit: number | null;
	barWidthPx: number | null;
	expand: {
		key: string | null;
		hovered: number | null;
		progress: Map<number, number>;
	};
	expandRaf: number;
	animateExpand: (key: string | null, index: number | null) => void;
	loadingRows: number[] | null;
	categories: string[];
	dataLength: number;
	brushRange: BrushRange;
	brushGeom: BrushGeometry | null;
	brushOverlay: BrushOverlayElements | null;
	brushHover: {
		inside: boolean;
		left: boolean;
		right: boolean;
	};
	handlers: {
		onBrushChange?: (range: { startIndex: number; endIndex: number }) => void;
		clickableKeys: Set<string>;
		selectedDataKey?: string | null;
		onSelectionChange?: (key: string | null) => void;
		brushFormatLabel?: (value: string, index: number) => string;
		seriesKeys: string[];
		hasStripped: boolean;
		hasBlocks: boolean;
		hasStackGap: boolean;
		expandableKey: string | null;
		barCategoryGap?: number;
		isHorizontal: boolean;
	};
	repush: () => void;
	patchStrippedCaps: () => void;
};
export function EChartsBarChart<TData extends ChartRow>({
	data,
	config,
	renderer = DEFAULT_ECHARTS_RENDERER,
	xDataKey,
	className,
	stackType = "default",
	layout = "vertical",
	barRadius = DEFAULT_BAR_RADIUS,
	animation = true,
	animationType = "left-to-right",
	barGap,
	barCategoryGap,
	defaultSelectedDataKey = null,
	onSelectionChange,
	enableMaxValueHighlight = false,
	isLoading = false,
	loadingBars = LOADING_DEFAULT_BARS,
	chartOptions,
	activeIndex,
	children,
}: EChartsBarChartProps<TData>) {
	const rawId = useId();
	const chartId = `chart-${rawId.replace(/:/g, "")}`;
	const containerRef = useRef<HTMLDivElement>(null);
	const mountRef = useRef<HTMLDivElement>(null);
	const echartsRef = useRef<EChartsInstance | null>(null);
	const live = useRef<LiveState>({
		resolved: null,
		hasRevealed: false,
		revealEndsAt: 0,
		valuePxPerUnit: null,
		barWidthPx: null,
		expand: { key: null, hovered: null, progress: new Map<number, number>() },
		expandRaf: 0,
		animateExpand: () => {},
		loadingRows: null,
		categories: [],
		dataLength: 0,
		brushRange: { start: 0, end: 100 },
		brushGeom: null,
		brushOverlay: null,
		brushHover: { inside: false, left: false, right: false },
		handlers: {
			onBrushChange: undefined,
			clickableKeys: new Set<string>(),
			brushFormatLabel: undefined,
			seriesKeys: [],
			hasStripped: false,
			hasBlocks: false,
			hasStackGap: false,
			expandableKey: null,
			isHorizontal: false,
		},
		repush: () => {},
		patchStrippedCaps: () => {},
	}).current;
	const loadingData = useCallback(
		() => (live.loadingRows ??= getLoadingBarData(loadingBars)),
		[live, loadingBars],
	);
	const shouldReduceMotion = useReducedMotion();
	const [selectedDataKey, setSelectedDataKey] = useState<string | null>(
		defaultSelectedDataKey,
	);
	const collected = useMemo(() => collectConfig(children), [children]);
	const {
		bars,
		xAxis: xAxisSlot,
		yAxis: yAxisSlot,
		showGrid,
		tooltip: tooltipSlot,
		legend: legendSlot,
		brush: brushSlot,
	} = collected;
	const showBrush = brushSlot.present;
	const brushHeight = brushSlot.height ?? 56;
	const isHorizontal = layout === "horizontal";
	const isPercent = stackType === "percent";
	const isStacked = stackType === "stacked" || isPercent;
	const categorySlot = isHorizontal ? yAxisSlot : xAxisSlot;
	const valueSlot = isHorizontal ? xAxisSlot : yAxisSlot;
	const seriesKeys = useMemo(() => bars.map((bar) => bar.dataKey), [bars]);
	const categoryKey = useMemo(() => {
		if (categorySlot.dataKey) return categorySlot.dataKey;
		if (xDataKey) return xDataKey as string;
		const firstRow = data[0];
		if (firstRow) {
			const claimed = new Set(seriesKeys);
			const found = Object.keys(firstRow).find((key) => !claimed.has(key));
			if (found) return found;
		}
		return "";
	}, [categorySlot.dataKey, xDataKey, data, seriesKeys]);
	const effectiveAnimation = bars[0]?.animationType ?? animationType;
	const maxHighlightIndex = useMemo(() => {
		if (!enableMaxValueHighlight || !data.length || !seriesKeys.length)
			return null;
		let best = 0;
		let bestTotal = -Infinity;
		data.forEach((row, i) => {
			const total = finiteSum(
				seriesKeys.map((key) => finiteValue(row[key]) ?? 0),
			);
			if (total > bestTotal) {
				bestTotal = total;
				best = i;
			}
		});
		return best;
	}, [enableMaxValueHighlight, data, seriesKeys]);
	const css = useMemo(() => buildChartCss(chartId, config), [chartId, config]);
	const hasSelection = selectedDataKey !== null;
	const clickableKeys = useMemo(
		() =>
			new Set(bars.filter((bar) => bar.isClickable).map((bar) => bar.dataKey)),
		[bars],
	);
	const hasStrippedBars =
		!isLoading && bars.some((bar) => bar.variant === "stripped");

	const toggleSelection = useCallback(
		(key: string) => {
			const next = live.handlers.selectedDataKey === key ? null : key;
			live.handlers.selectedDataKey = next;
			setSelectedDataKey(next);
			live.handlers.onSelectionChange?.(next);
		},
		[live],
	);
	const brushEnabled = showBrush && !isHorizontal;
	const syncBrushOverlayNow = useCallback(() => {
		const chart = echartsRef.current;
		if (!chart) return;
		const geom = live.brushGeom;
		const tokens = live.resolved?.tokens;
		if (!geom || !tokens) {
			syncBrushOverlay(chart, live, null);
			return;
		}
		const range = live.brushRange;
		const categories = live.categories;
		const format = live.handlers.brushFormatLabel;
		const lastIndex = Math.max(categories.length - 1, 0);
		const startIndex = Math.round((range.start / 100) * lastIndex);
		const endIndex = Math.round((range.end / 100) * lastIndex);
		const labels =
			format && categories.length
				? {
						start: format(categories[startIndex] ?? "", startIndex),
						end: format(categories[endIndex] ?? "", endIndex),
					}
				: null;
		syncBrushOverlay(chart, live, {
			range,
			geom,
			size: { width: chart.getWidth(), height: chart.getHeight() },
			tokens,
			labels,
			showLabels: live.brushHover.inside,
			hover: live.brushHover,
		});
	}, [live]);
	const buildOption = useCallback((): EChartsOption => {
		const resolved = live.resolved;
		if (!resolved) return {};
		const categories = data.map((row) => String(row[categoryKey]));
		live.categories = categories;
		const ctx: OptionBuildContext = {
			data,
			config,
			bars,
			seriesKeys,
			animationType,
			barRadius,
			isHorizontal,
			isStacked,
			isPercent,
			selectedDataKey,
			hasSelection,
			showGrid,
			categorySlot,
			valueSlot,
			tooltipSlot,
			legendSlot,
			isLoading,
			loadingData,
			showBrush: brushEnabled,
			brushHeight,
			barGap,
			barCategoryGap,
			resolved,
			categories,
			brushRange: live.brushRange,
			valuePxPerUnit: live.valuePxPerUnit,
			barWidthPx: live.barWidthPx,
			expand: live.expand,
			maxHighlightIndex,
		};
		const { grid, brushBottom } = buildChartLayout(ctx);
		live.brushGeom = brushEnabled
			? { bottom: brushBottom, height: brushHeight }
			: null;
		const { xAxis, yAxis } = buildMainAxes(ctx);
		if (isLoading) return buildLoadingOption(ctx, { grid, xAxis, yAxis });
		const brush = brushEnabled ? buildBrushOption(ctx, brushBottom) : null;
		return {
			animation: false,
			grid: brush ? [grid, brush.miniGrid] : grid,
			xAxis: brush ? [xAxis, brush.miniXAxis] : xAxis,
			yAxis: brush ? [yAxis, brush.miniYAxis] : yAxis,
			tooltip: buildTooltipOption(ctx),
			dataZoom: brush?.dataZoom,
			series: [...buildBarSeries(ctx), ...(brush?.miniSeries ?? [])],
		};
	}, [
		live,
		data,
		config,
		bars,
		seriesKeys,
		categoryKey,
		animationType,
		barRadius,
		isHorizontal,
		isStacked,
		isPercent,
		selectedDataKey,
		hasSelection,
		showGrid,
		categorySlot,
		valueSlot,
		tooltipSlot,
		legendSlot,
		isLoading,
		loadingData,
		brushEnabled,
		brushHeight,
		barGap,
		barCategoryGap,
		maxHighlightIndex,
	]);
	const setupChart = useCallback(() => {
		const mount = mountRef.current;
		const container = containerRef.current;
		if (!mount || !container) return;
		const chart = echarts.init(mount, null, { renderer });
		echartsRef.current = chart;
		const resizeObserver = new ResizeObserver(() => {
			if (
				mount.clientWidth === chart.getWidth() &&
				mount.clientHeight === chart.getHeight()
			) {
				return;
			}
			chart.resize();
			live.repush();
		});
		resizeObserver.observe(mount);
		const themeObserver = observeChartTheme(container, () => live.repush());
		chart
			.getZr()
			.on("mousemove", (event: { offsetX: number; offsetY: number }) => {
				const { expandableKey } = live.handlers;
				if (!expandableKey) return;
				const point = [event.offsetX, event.offsetY];
				if (!chart.containPixel({ gridIndex: 0 }, point)) {
					live.animateExpand(expandableKey, null);
					return;
				}
				const converted = chart.convertFromPixel({ gridIndex: 0 }, point);
				const index = Array.isArray(converted)
					? converted[live.handlers.isHorizontal ? 1 : 0]
					: converted;
				live.animateExpand(
					expandableKey,
					typeof index === "number" ? Math.round(index) : null,
				);
			});
		chart.getZr().on("globalout", () => {
			const { expandableKey } = live.handlers;
			if (expandableKey) live.animateExpand(expandableKey, null);
		});
		chart.on("click", (params) => {
			const { clickableKeys: clickable, seriesKeys: keys } = live.handlers;
			const p = params as {
				seriesId?: string;
				seriesIndex?: number;
			};
			const id =
				p.seriesId ??
				(typeof p.seriesIndex === "number" ? keys[p.seriesIndex] : undefined);
			if (typeof id === "string" && clickable.has(id)) toggleSelection(id);
		});
		chart.on("datazoom", () => {
			const option = chart.getOption() as {
				dataZoom?: {
					start?: number;
					end?: number;
				}[];
			};
			const zoom = option.dataZoom?.[0];
			if (!zoom) return;
			live.brushRange = { start: zoom.start ?? 0, end: zoom.end ?? 100 };
			syncBrushOverlayNow();
			const { onBrushChange: onChange } = live.handlers;
			if (!onChange) return;
			const len = live.dataLength;
			if (len < 1) return;
			const startIndex = Math.round(((zoom.start ?? 0) / 100) * (len - 1));
			const endIndex = Math.round(((zoom.end ?? 100) / 100) * (len - 1));
			onChange({ startIndex, endIndex });
		});
		chart.on("finished", () => {
			const { hasStripped, isHorizontal: horiz } = live.handlers;
			if (!hasStripped || performance.now() < live.revealEndsAt) return;
			const measured = measureValuePxPerUnit(chart, horiz);
			if (measured == null) return;
			if (
				live.valuePxPerUnit != null &&
				Math.abs(measured - live.valuePxPerUnit) < 0.5
			)
				return;
			live.valuePxPerUnit = measured;
			live.patchStrippedCaps();
		});
		const zr = chart.getZr();
		const applyHover = (next: {
			inside: boolean;
			left: boolean;
			right: boolean;
		}) => {
			const prev = live.brushHover;
			if (
				prev.inside === next.inside &&
				prev.left === next.left &&
				prev.right === next.right
			) {
				return;
			}
			live.brushHover = next;
			syncBrushOverlayNow();
		};
		const onZrMove = (event: { offsetX?: number; offsetY?: number }) => {
			const geom = live.brushGeom;
			if (!geom) return;
			const x = event.offsetX ?? -1;
			const y = event.offsetY ?? -1;
			const top = chart.getHeight() - geom.bottom - geom.height;
			const inside = y >= top - 4 && y <= top + geom.height + 4;
			const trackLeft = 8;
			const trackWidth = Math.max(chart.getWidth() - 16, 1);
			const { start, end } = live.brushRange;
			const selectionLeft = trackLeft + (trackWidth * start) / 100;
			const selectionRight = trackLeft + (trackWidth * end) / 100;
			applyHover({
				inside,
				left: inside && Math.abs(x - selectionLeft) <= 8,
				right: inside && Math.abs(x - selectionRight) <= 8,
			});
		};
		const onZrOut = () =>
			applyHover({ inside: false, left: false, right: false });
		zr.on("mousemove", onZrMove);
		zr.on("globalout", onZrOut);
		return () => {
			zr.off("mousemove", onZrMove);
			zr.off("globalout", onZrOut);
			resizeObserver.disconnect();
			themeObserver.disconnect();
			if (live.expandRaf) {
				cancelAnimationFrame(live.expandRaf);
				live.expandRaf = 0;
			}
			cancelActiveTooltip(chart);
			chart.off();
			chart.getZr().off();
			chart.dispose();
			live.repush = () => {};
			echartsRef.current = null;
			live.brushOverlay = null;
			live.brushHover = { inside: false, left: false, right: false };
			live.expand = {
				key: null,
				hovered: null,
				progress: new Map<number, number>(),
			};
			live.animateExpand = () => {};
			live.valuePxPerUnit = null;
			live.barWidthPx = null;
			live.hasRevealed = false;
		};
	}, [renderer]);
	const synchronizeChart = useCallback(() => {
		if (live.expandRaf) cancelAnimationFrame(live.expandRaf);
		live.expandRaf = 0;
		const hovered = boundedIndex(live.expand.hovered, data.length);
		live.expand.hovered = hovered;
		live.expand.progress.clear();
		if (hovered !== null) live.expand.progress.set(hovered, 1);
		const chart = echartsRef.current;
		const container = containerRef.current;
		if (!chart || !container) return;
		live.resolved = resolveColors(container, config, seriesKeys);
		const push = (withEntrance: boolean) => {
			const measured = measureValuePxPerUnit(chart, isHorizontal);
			if (measured != null) live.valuePxPerUnit = measured;
			const apply = () => {
				const option = buildOption();
				const merged = chartOptions ? { ...option, ...chartOptions } : option;
				Object.assign(merged, {
					animation: withEntrance,
					animationDuration: BAR_GROW_DURATION,
					animationDurationUpdate: 0,
				});
				setChartOption(chart, merged);
				if (activeIndex !== undefined)
					showActiveIndex(
						chart,
						isLoading ? null : boundedIndex(activeIndex, data.length),
						seriesKeys[0],
					);
			};
			apply();
			let needsRebuild = false;
			if (live.handlers.hasBlocks) {
				const width = measureBarWidthPx(chart, isHorizontal, barCategoryGap);
				if (
					width != null &&
					(live.barWidthPx == null || Math.abs(width - live.barWidthPx) > 0.5)
				) {
					live.barWidthPx = width;
					needsRebuild = true;
				}
			}
			if (live.handlers.hasStackGap || live.handlers.hasStripped) {
				const scale = measureValuePxPerUnit(chart, isHorizontal);
				if (
					scale != null &&
					(live.valuePxPerUnit == null || live.valuePxPerUnit !== scale)
				) {
					live.valuePxPerUnit = scale;
					needsRebuild = true;
				}
			}
			if (needsRebuild) apply();
			const maxStagger = data.length > 1 ? (data.length - 1) * BAR_STAGGER : 0;
			live.revealEndsAt = withEntrance
				? performance.now() + BAR_GROW_DURATION + maxStagger
				: 0;
			syncBrushOverlayNow();
		};
		live.animateExpand = (key: string | null, index: number | null) => {
			const expandKeys = new Set(
				bars
					.filter((bar) => bar.variant === "expandable")
					.map((bar) => bar.dataKey),
			);
			if (!expandKeys.size) return;
			const next = key != null ? boundedIndex(index, data.length) : null;
			if (
				live.expand.hovered === next &&
				(key == null || live.expand.key === key)
			)
				return;
			if (key != null) live.expand.key = key;
			live.expand.hovered = next;
			if (next != null && !live.expand.progress.has(next)) {
				live.expand.progress.set(next, EXPAND_COLLAPSED);
			}
			if (live.expandRaf) return;
			const patchOnce = () => {
				const option = buildOption();
				const series = Array.isArray(option.series)
					? option.series
					: option.series
						? [option.series]
						: [];
				const patch = series.filter(
					(s): s is BarSeriesOption =>
						typeof s?.id === "string" && expandKeys.has(s.id),
				);
				if (patch.length)
					chart.setOption(
						{ series: patch },
						{ silent: true, lazyUpdate: true },
					);
			};
			if (shouldReduceMotion) {
				live.expand.progress.clear();
				if (next !== null) live.expand.progress.set(next, 1);
				patchOnce();
				return;
			}
			let last = performance.now();
			const step = () => {
				const now = performance.now();
				const dt = Math.min(64, now - last);
				last = now;
				const k = 1 - Math.exp(-dt / EXPAND_TAU);
				let moving = false;
				for (const [i, value] of live.expand.progress) {
					const target = i === live.expand.hovered ? 1 : EXPAND_COLLAPSED;
					const eased = value + (target - value) * k;
					if (Math.abs(target - eased) < 0.004) {
						if (target === EXPAND_COLLAPSED) live.expand.progress.delete(i);
						else live.expand.progress.set(i, target);
					} else {
						live.expand.progress.set(i, eased);
						moving = true;
					}
				}
				patchOnce();
				live.expandRaf = moving ? requestAnimationFrame(step) : 0;
			};
			live.expandRaf = requestAnimationFrame(step);
		};
		live.patchStrippedCaps = () => {
			const option = buildOption();
			const series = Array.isArray(option.series)
				? option.series
				: option.series
					? [option.series]
					: [];
			const strippedKeys = new Set(
				bars
					.filter((bar) => bar.variant === "stripped")
					.map((bar) => bar.dataKey),
			);
			const patch = series.filter(
				(s): s is BarSeriesOption =>
					typeof s?.id === "string" && strippedKeys.has(s.id),
			);
			if (patch.length)
				chart.setOption({ series: patch }, { silent: true, lazyUpdate: true });
		};
		if (isLoading) live.hasRevealed = false;
		const shouldReveal = !live.hasRevealed && !isLoading;
		if (shouldReveal) live.hasRevealed = true;
		const revealEnabled =
			animation &&
			shouldReveal &&
			effectiveAnimation !== "none" &&
			!shouldReduceMotion;
		push(revealEnabled);
		live.repush = () => {
			live.resolved = resolveColors(container, config, seriesKeys);
			push(false);
		};
	}, [
		renderer,
		live,
		buildOption,
		chartOptions,
		activeIndex,
		data.length,
		isLoading,
		animation,
		effectiveAnimation,
		shouldReduceMotion,
		config,
		seriesKeys,
		data.length,
		bars,
		isHorizontal,
		barCategoryGap,
		syncBrushOverlayNow,
	]);
	const animatePrimary = useCallback(() => {
		const chart = echartsRef.current;
		const index = tooltipSlot.defaultIndex;
		if (
			!chart ||
			isLoading ||
			activeIndex !== undefined ||
			!tooltipSlot.present ||
			boundedIndex(index, data.length) === null
		)
			return;
		const timer = setTimeout(() => {
			chart.dispatchAction({
				type: "showTip",
				seriesIndex: 0,
				dataIndex: index,
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [
		renderer,
		tooltipSlot.present,
		tooltipSlot.defaultIndex,
		activeIndex,
		isLoading,
		data.length,
		seriesKeys.length,
	]);
	const animateLoading = useCallback(() => {
		const chart = echartsRef.current;
		if (!chart || !isLoading || shouldReduceMotion) return;
		let raf = 0;
		let lastPhase = 0;
		const start = performance.now();
		const tick = (now: number) => {
			const phase =
				((((now - start) / LOADING_ANIMATION_DURATION) % 1) + 1) % 1;
			if (phase < lastPhase) live.loadingRows = getLoadingBarData(loadingBars);
			lastPhase = phase;
			const foreground = live.resolved?.tokens.foreground ?? GRAY;
			const w = chart.getWidth();
			const h = chart.getHeight();
			if (!w || !h) {
				raf = requestAnimationFrame(tick);
				return;
			}
			const maxT = (w + h) / (2 * w);
			const center =
				phase * (maxT + 2 * LOADING_SHIMMER_BAND) - LOADING_SHIMMER_BAND;
			const fill = new echarts.graphic.LinearGradient(
				0,
				0,
				w,
				w,
				shimmerWindowStops(center, foreground, LOADING_SHIMMER_MAX_OPACITY),
				true,
			);
			chart.setOption(
				{
					series: [
						{
							id: "__loading",
							data: loadingData(),
							itemStyle: { color: fill },
						},
					],
				},
				{ silent: true, lazyUpdate: true },
			);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [renderer, live, isLoading, loadingBars, loadingData, shouldReduceMotion]);
	const commitChart = useChartLifecycle(
		{
			prepare: () => {
				live.handlers = {
					onBrushChange: brushSlot.onChange,
					selectedDataKey,
					onSelectionChange,
					clickableKeys,
					brushFormatLabel: brushSlot.formatLabel,
					seriesKeys,
					hasStripped: hasStrippedBars,
					hasBlocks: bars.some((bar) => bar.variant === "blocks"),
					hasStackGap:
						(stackType === "stacked" || stackType === "percent") &&
						bars.length > 1,
					expandableKey:
						bars.find((bar) => bar.variant === "expandable")?.dataKey ?? null,
					barCategoryGap,
					isHorizontal,
				};
				live.dataLength = data.length;
			},
			setup: setupChart,
			synchronize: synchronizeChart,
			animate: [animatePrimary, animateLoading],
		},
		containerRef,
	);

	const legendStyle: CSSProperties = {
		position: "absolute",
		left: 16,
		right: 16,
		pointerEvents: "auto",
		...(legendSlot.verticalAlign === "top"
			? { top: 12 }
			: legendSlot.verticalAlign === "bottom"
				? { bottom: brushEnabled ? brushHeight + 16 : 12 }
				: { top: "50%", transform: "translateY(-50%)" }),
	};
	return (
		<div
			ref={commitChart}
			data-chart={chartId}
			className={`relative flex flex-col text-xs ${className ?? ""}`}
		>
			<style dangerouslySetInnerHTML={{ __html: css }} />

			<div className="relative min-h-0 w-full flex-1">
				<div ref={mountRef} className="h-full min-h-0 w-full" />
			</div>

			{legendSlot.present && !isLoading && (
				<LegendOverlay
					seriesKeys={seriesKeys}
					config={config}
					variant={legendSlot.variant}
					align={legendSlot.align}
					verticalAlign={legendSlot.verticalAlign}
					selectedKey={selectedDataKey}
					hoveredKey={null}
					isClickable={legendSlot.isClickable}
					onToggle={toggleSelection}
					style={legendStyle}
				/>
			)}
		</div>
	);
}
function getLoadingBarData(bars: number): number[] {
	const rows: number[] = [];
	let value = 40 + Math.random() * 25;
	for (let i = 0; i < bars; i++) {
		value = Math.min(85, Math.max(20, value + (Math.random() - 0.5) * 30));
		rows.push(Math.round(value));
	}
	return rows;
}
function shimmerWindowStops(center: number, color: string, peak: number) {
	const half = LOADING_SHIMMER_BAND;
	const feather = LOADING_SHIMMER_FEATHER;
	const alphaAt = (x: number) => {
		const dist = Math.abs(x - center);
		if (dist <= half - feather) return peak;
		if (dist >= half) return 0;
		return (
			peak * Math.sin(((1 - (dist - (half - feather)) / feather) * Math.PI) / 2)
		);
	};
	const offsets = [
		0,
		center - half,
		center - half + feather,
		center,
		center + half - feather,
		center + half,
		1,
	]
		.filter((x) => x >= 0 && x <= 1)
		.sort((a, b) => a - b);
	const stops: {
		offset: number;
		color: string;
	}[] = [];
	for (const offset of offsets) {
		if (
			stops.length === 0 ||
			offset - (stops.at(-1)?.offset ?? -Infinity) > 1e-4
		) {
			stops.push({ offset, color: withAlpha(color, alphaAt(offset)) });
		}
	}
	return stops;
}
EChartsBarChart.Bar = Bar;
EChartsBarChart.XAxis = XAxis;
EChartsBarChart.YAxis = YAxis;
EChartsBarChart.Grid = Grid;
EChartsBarChart.Tooltip = Tooltip;
EChartsBarChart.Legend = Legend;
EChartsBarChart.Brush = Brush;
