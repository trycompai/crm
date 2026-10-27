"use client";
import { LineChart, type LineSeriesOption } from "echarts/charts";
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
	seriesPaint,
	withAlpha,
} from "../ui/echarts-chart";
import { ECHARTS_CONFIG } from "../ui/echarts-config";
import {
	type DotVariant,
	dotItemStyle,
	dotStyle,
	sampleGradient,
} from "../ui/echarts-dot";
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
	DotVariant,
	EChartsRenderer,
	LegendVariant,
	TooltipPosition,
	TooltipRoundness,
	TooltipVariant,
};

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent]);
type EChartsInstance = ReturnType<typeof echarts.init>;
type EChartsOption = ComposeOption<
	| LineSeriesOption
	| GridComponentOption
	| TooltipComponentOption
	| DataZoomComponentOption
>;
type ArrayItem<T> = T extends readonly (infer U)[] ? U : T;
type XAxisOption = ArrayItem<NonNullable<EChartsOption["xAxis"]>>;
type YAxisOption = ArrayItem<NonNullable<EChartsOption["yAxis"]>>;
const {
	STROKE_WIDTH,
	LOADING_ANIMATION_DURATION,
	REVEAL_DURATION,
	LOADING_DEFAULT_POINTS,
	BUFFER_DASH,
	GRID_LINE_OPACITY,
	AXIS_POINTER_OPACITY,
	LOADING_STROKE_OPACITY,
	LOADING_SHIMMER_MAX_OPACITY,
	LOADING_SHIMMER_BAND,
	LOADING_SHIMMER_FEATHER,
	BRUSH_STROKE_OPACITY,
	BRUSH_FILL_OPACITY,
	BRUSH_FILLER_OPACITY,
	BUFFER_PREFIX,
	BUFFERFILL_PREFIX,
	REVEAL_PREFIX,
} = ECHARTS_CONFIG.area;

export type AreaVariant =
	| "gradient"
	| "gradient-reverse"
	| "solid"
	| "dotted"
	| "lines"
	| "hatched"
	| "none";
export type StrokeVariant = "solid" | "dashed" | "animated-dashed";
export type StackType = "default" | "stacked" | "expanded";
export type AreaAnimationType =
	| "none"
	| "left-to-right"
	| "right-to-left"
	| "center-out"
	| "edges-in";
export type CurveType =
	| "linear"
	| "smooth"
	| "bump"
	| "monotone"
	| "monotoneX"
	| "monotoneY"
	| "natural"
	| "step";
export interface EChartsAreaChartProps<TData extends ChartRow> {
	data: TData[];
	config: ChartConfig;
	renderer?: EChartsRenderer;
	xDataKey?: keyof TData & string;
	className?: string;
	curveType?: CurveType;
	stackType?: StackType;
	animation?: boolean;
	animationType?: AreaAnimationType;
	enableHoverHighlight?: boolean;
	enableHoverReveal?: boolean;
	defaultSelectedDataKey?: string | null;
	selectedDataKey?: string | null;
	onSelectionChange?: (key: string | null) => void;
	isLoading?: boolean;
	loadingPoints?: number;
	chartOptions?: EChartsOption;
	activeIndex?: number | null;
	onHoverIndexChange?: (index: number | null) => void;
	children?: ReactNode;
}
export interface AreaProps {
	dataKey: string;
	variant?: AreaVariant;
	strokeVariant?: StrokeVariant;
	strokeWidth?: number;
	curveType?: CurveType;
	animationType?: AreaAnimationType;
	connectNulls?: boolean;
	isClickable?: boolean;
	enableBufferLine?: boolean;
	children?: ReactNode;
}
const Area: FC<AreaProps> = () => null;
export interface DotProps {
	variant?: DotVariant;
}
const Dot: FC<DotProps> = () => null;
const ActiveDot: FC<DotProps> = () => null;
export interface XAxisProps {
	dataKey?: string;
	tickFormatter?: (value: string, index: number) => string;
	label?: string;
	hideDots?: boolean;
}
const XAxis: FC<XAxisProps> = () => null;
export interface YAxisProps {
	dataKey?: string;
	tickFormatter?: (value: number, index: number) => string;
	label?: string;
	hideDots?: boolean;
}
const YAxis: FC<YAxisProps> = () => null;
const Grid: FC = () => null;
export interface TooltipProps {
	variant?: TooltipVariant;
	roundness?: TooltipRoundness;
	cursor?: boolean;
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
type AreaSeriesConfig = {
	dataKey: string;
	variant: AreaVariant;
	strokeVariant: StrokeVariant;
	strokeWidth: number;
	curveType?: CurveType;
	animationType?: AreaAnimationType;
	connectNulls: boolean;
	isClickable: boolean;
	enableBufferLine: boolean;
	dotVariant: DotVariant;
	activeDotVariant: DotVariant;
};
type XAxisSlot = {
	present: boolean;
	dataKey?: string;
	tickFormatter?: (value: string, index: number) => string;
	label?: string;
	hideDots: boolean;
};
type YAxisSlot = {
	present: boolean;
	dataKey?: string;
	tickFormatter?: (value: number, index: number) => string;
	label?: string;
	hideDots: boolean;
};
type TooltipSlot = {
	valueFormatter?: (value: number) => string;
	present: boolean;
	variant: TooltipVariant;
	roundness: TooltipRoundness;
	cursor: boolean;
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
	areas: AreaSeriesConfig[];
	xAxis: XAxisSlot;
	yAxis: YAxisSlot;
	showGrid: boolean;
	tooltip: TooltipSlot;
	legend: LegendSlot;
	brush: BrushSlot;
};
function collectConfig(children: ReactNode): CollectedConfig {
	const areas: AreaSeriesConfig[] = [];
	let xAxis: XAxisSlot = { present: false, hideDots: false };
	let yAxis: YAxisSlot = { present: false, hideDots: false };
	let showGrid = false;
	let tooltip: TooltipSlot = {
		present: false,
		variant: "default",
		roundness: "lg",
		cursor: true,
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
		if (type === Area) {
			const props = child.props as AreaProps;
			let dotVariant: DotVariant = "none";
			let activeDotVariant: DotVariant = "none";
			Children.forEach(props.children, (dotChild) => {
				if (!isValidElement(dotChild)) return;
				if (dotChild.type === Dot) {
					dotVariant = (dotChild.props as DotProps).variant ?? "default";
				} else if (dotChild.type === ActiveDot) {
					activeDotVariant = (dotChild.props as DotProps).variant ?? "default";
				}
			});
			areas.push({
				dataKey: props.dataKey,
				variant: props.variant ?? "gradient",
				strokeVariant: props.strokeVariant ?? "dashed",
				strokeWidth: props.strokeWidth ?? STROKE_WIDTH,
				curveType: props.curveType,
				animationType: props.animationType,
				connectNulls: props.connectNulls ?? false,
				isClickable: props.isClickable ?? false,
				enableBufferLine: props.enableBufferLine ?? false,
				dotVariant,
				activeDotVariant,
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
				cursor: props.cursor ?? true,
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
	return { areas, xAxis, yAxis, showGrid, tooltip, legend, brush };
}
function patternFill(
	kind: "dotted" | "lines" | "hatched" | "stripe",
	color: string,
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
	if (kind === "dotted") {
		size(6, 6);
		ctx.fillStyle = withAlpha(color, 0.7);
		ctx.beginPath();
		ctx.arc(3, 3, 0.85, 0, Math.PI * 2);
		ctx.fill();
		return pattern();
	}
	if (kind === "lines" || kind === "stripe") {
		size(5, 5);
		ctx.strokeStyle = withAlpha(color, 0.3);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(2.5, -1);
		ctx.lineTo(2.5, 6);
		ctx.stroke();
		return pattern(-Math.PI / 4);
	}
	size(20, 20);
	ctx.fillStyle = withAlpha(color, 0.06);
	ctx.fillRect(0, 0, 10, 20);
	ctx.fillStyle = withAlpha(color, 0.22);
	ctx.fillRect(10, 0, 10, 20);
	return pattern((20 * Math.PI) / 180);
}
function gradientFillTexture(
	slots: string[],
	width: number,
	height: number,
	reverse: boolean,
): HTMLCanvasElement | null {
	if (typeof document === "undefined" || width < 1 || height < 1) return null;
	const canvas = document.createElement("canvas");
	canvas.width = Math.ceil(width);
	canvas.height = Math.ceil(height);
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const colors = ctx.createLinearGradient(0, 0, canvas.width, 0);
	slots.forEach((color, i) => {
		colors.addColorStop(i / (slots.length - 1), color);
	});
	ctx.fillStyle = colors;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	const fade = ctx.createLinearGradient(0, 0, 0, canvas.height);
	fade.addColorStop(0, `rgba(0, 0, 0, ${reverse ? 0 : 0.1})`);
	fade.addColorStop(1, `rgba(0, 0, 0, ${reverse ? 0.1 : 0})`);
	ctx.globalCompositeOperation = "destination-in";
	ctx.fillStyle = fade;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	return canvas;
}
function patternFadeTexture(
	kind: "dotted" | "lines" | "hatched",
	color: string,
	width: number,
	height: number,
): HTMLCanvasElement | null {
	const patternObj = patternFill(kind, color);
	if (!patternObj || typeof document === "undefined" || width < 1 || height < 1)
		return null;
	const tile = patternObj.image;
	if (!(tile instanceof HTMLCanvasElement)) return null;
	const rotation = patternObj.rotation ?? 0;
	const tileScale = patternObj.scaleX ?? 1;
	const w = Math.ceil(width);
	const h = Math.ceil(height);
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	const pat = ctx.createPattern(tile, "repeat");
	if (!pat) return null;
	if (typeof pat.setTransform === "function") {
		const m = new DOMMatrix();
		m.rotateSelf((rotation * 180) / Math.PI);
		m.scaleSelf(tileScale, tileScale);
		pat.setTransform(m);
	}
	ctx.fillStyle = pat;
	ctx.fillRect(0, 0, w, h);
	const fade = ctx.createLinearGradient(0, 0, 0, h);
	fade.addColorStop(0, "rgba(0, 0, 0, 1)");
	fade.addColorStop(1, "rgba(0, 0, 0, 0)");
	ctx.globalCompositeOperation = "destination-in";
	ctx.fillStyle = fade;
	ctx.fillRect(0, 0, w, h);
	return canvas;
}
function fillPaint(
	variant: AreaVariant,
	showUnselected: boolean,
	slots: string[],
	size: {
		width: number;
		height: number;
	},
): string | echarts.graphic.LinearGradient | ImagePatternObject {
	const base = slots[0] ?? "rgba(120, 120, 120, 1)";
	const multi = slots.length > 1;
	if (variant === "none") return "transparent";
	if (showUnselected) {
		return patternFill("stripe", base) ?? withAlpha(base, 0.1);
	}
	switch (variant) {
		case "gradient":
		case "gradient-reverse": {
			const reverse = variant === "gradient-reverse";
			if (multi) {
				const texture = gradientFillTexture(
					slots,
					size.width,
					size.height,
					reverse,
				);
				if (texture) return { image: texture, repeat: "no-repeat" };
			}
			return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
				{ offset: 0, color: withAlpha(base, reverse ? 0 : 0.1) },
				{ offset: 1, color: withAlpha(base, reverse ? 0.1 : 0) },
			]);
		}
		case "solid": {
			if (multi) {
				return new echarts.graphic.LinearGradient(
					0,
					0,
					1,
					0,
					slots.map((color, i) => ({
						offset: i / (slots.length - 1),
						color: withAlpha(color, 0.1),
					})),
				);
			}
			return withAlpha(base, 0.1);
		}
		case "dotted":
		case "lines":
		case "hatched": {
			const texture = patternFadeTexture(
				variant,
				base,
				size.width,
				size.height,
			);
			if (texture) return { image: texture, repeat: "no-repeat" };
			return patternFill(variant, base) ?? withAlpha(base, 0.1);
		}
		default:
			return withAlpha(base, 0.1);
	}
}
function curveConfig(curveType: CurveType): {
	smooth: boolean;
	step: "middle" | false;
} {
	if (curveType === "step") return { smooth: false, step: "middle" };
	if (curveType === "linear") return { smooth: false, step: false };
	return { smooth: true, step: false };
}
function getOpacity(selected: string | null, key: string) {
	if (selected === null || selected === key)
		return { fill: 0.8, stroke: 1, dot: 1 };
	return { fill: 0.1, stroke: 0.3, dot: 0.3 };
}
function getLoadingData(points: number): number[] {
	const rows: number[] = [];
	let value = 30 + Math.random() * 20;
	for (let i = 0; i < points; i++) {
		value = Math.min(58, Math.max(16, value + (Math.random() - 0.5) * 16));
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

type OptionBuildContext = {
	data: ChartRow[];
	config: ChartConfig;
	areas: AreaSeriesConfig[];
	seriesKeys: string[];
	curveType: CurveType;
	isStacked: boolean;
	isExpanded: boolean;
	selectedDataKey: string | null;
	hasSelection: boolean;
	showGrid: boolean;
	xAxisSlot: XAxisSlot;
	yAxisSlot: YAxisSlot;
	tooltipSlot: TooltipSlot;
	legendSlot: LegendSlot;
	isLoading: boolean;
	loadingData: () => number[];
	showBrush: boolean;
	brushHeight: number;
	enableHoverHighlight: boolean;
	enableHoverReveal: boolean;
	revealIndex: number | null;
	revealSink: Record<string, unknown[]>;
	resolved: ResolvedColors;
	rendererSize: {
		width: number;
		height: number;
	};
	categories: string[];
	brushRange: BrushRange;
	getHoveredKey: () => string | null;
};
function buildChartLayout({
	legendSlot,
	xAxisSlot,
	showBrush,
	brushHeight,
}: OptionBuildContext): {
	grid: GridComponentOption;
	brushBottom: number;
} {
	const legendTop = legendSlot.present && legendSlot.verticalAlign === "top";
	const legendBottom =
		legendSlot.present && legendSlot.verticalAlign === "bottom";
	const brushGap = showBrush
		? brushHeight + 30 + (xAxisSlot.label ? 22 : 0)
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
		xAxisSlot,
		yAxisSlot,
		showGrid,
		isLoading,
		isExpanded,
		categories,
		loadingData,
	} = ctx;
	const { tokens } = ctx.resolved;
	const axisLabelColor = tokens.mutedForeground;
	const splitLineColor = withAlpha(tokens.border, GRID_LINE_OPACITY);
	const tickDotColor = flattenColor(splitLineColor, tokens.background);
	const xTickFormatter = xAxisSlot.tickFormatter;
	const yTickFormatter = yAxisSlot.tickFormatter;
	const xAxis: XAxisOption = {
		type: "category",
		boundaryGap: false,
		show: true,
		data: isLoading ? loadingData().map((_, i) => i) : categories,
		name: isLoading ? undefined : xAxisSlot.label,
		nameLocation: "middle",
		nameGap: 30,
		nameTextStyle: { color: axisLabelColor, fontSize: 10 },
		axisLine: { show: false },
		axisTick: {
			show: !isLoading && xAxisSlot.present && !xAxisSlot.hideDots,
			alignWithLabel: true,
			length: 0.5,
			lineStyle: { color: tickDotColor, width: 3, cap: "round" },
		},
		splitLine: { show: false },
		axisLabel: {
			show: !isLoading && xAxisSlot.present,
			color: axisLabelColor,
			fontSize: 10,
			margin: 8,
			formatter: xTickFormatter
				? (value: string, index: number) => xTickFormatter(value, index)
				: undefined,
		},
	};
	const yAxis: YAxisOption = {
		type: "value",
		show: yAxisSlot.present || showGrid,
		max: isExpanded ? 1 : undefined,
		name: isLoading ? undefined : yAxisSlot.label,
		nameLocation: "middle",
		nameGap: 38,
		nameTextStyle: { color: axisLabelColor, fontSize: 10 },
		axisLine: { show: false },
		axisTick: {
			show: yAxisSlot.present && !isLoading && !yAxisSlot.hideDots,
			length: 0.5,
			lineStyle: { color: tickDotColor, width: 3, cap: "round" },
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
			show: yAxisSlot.present && !isLoading,
			color: axisLabelColor,
			fontSize: 10,
			margin: 8,
			formatter: isExpanded
				? (value: number) => `${Math.round(value * 100)}%`
				: yTickFormatter
					? (value: number, index: number) => yTickFormatter(value, index)
					: undefined,
		},
	};
	return { xAxis, yAxis };
}
function createTooltipFormatter(ctx: OptionBuildContext) {
	const { config, selectedDataKey, tooltipSlot, getHoveredKey } = ctx;
	return (params: unknown): string => {
		const rows = Array.isArray(params) ? params : [params];
		if (!rows.length) return "";
		const first = rows[0] as {
			axisValue?: string | number;
			name?: string;
		};
		const axisValue = first.axisValue ?? first.name ?? "";
		const label = String(axisValue);
		const seen = new Set<string>();
		const body = rows
			.map((param) => {
				const p = param as {
					seriesId?: string;
					seriesName?: string;
					value?: number | string | null;
				};
				const rawId = String(p.seriesId ?? "");
				const key = rawId.startsWith(BUFFER_PREFIX)
					? rawId.slice(BUFFER_PREFIX.length)
					: rawId.startsWith("__")
						? ""
						: (p.seriesId ?? p.seriesName ?? "");
				if (!key) return "";
				if (p.value === null || p.value === undefined) return "";
				if (seen.has(key)) return "";
				seen.add(key);
				const item = config[key];
				const colorsCount = item ? getColorsCount(item) : 1;
				const labelText =
					typeof item?.label === "string" ? item.label : (p.seriesName ?? key);
				const hovered = getHoveredKey();
				const dimmed =
					(selectedDataKey != null && selectedDataKey !== key) ||
					(hovered != null && hovered !== key)
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
			cursor: tooltipSlot.cursor,
			tokens,
			position: tooltipSlot.position,
			axisPointerColor: withAlpha(tokens.border, AXIS_POINTER_OPACITY),
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
	miniSeries: LineSeriesOption[];
	dataZoom: DataZoomComponentOption[];
} {
	const {
		data,
		areas,
		curveType,
		isStacked,
		selectedDataKey,
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
		boundaryGap: false,
		show: false,
		data: categories,
		axisPointer: { show: false },
	};
	const miniYAxis: YAxisOption = { type: "value", gridIndex: 1, show: false };
	const miniSeries: LineSeriesOption[] = areas.map((area) => {
		const key = area.dataKey;
		const base =
			(ctx.resolved.series[key] ?? [])[0] ?? "rgba(120, 120, 120, 1)";
		const curve = curveConfig(area.curveType ?? curveType);
		const opacity = getOpacity(selectedDataKey, key);
		const strokeDim = opacity.stroke;
		const fillDim = opacity.fill / 0.8;
		return {
			id: `__mini-${key}`,
			type: "line",
			xAxisIndex: 1,
			yAxisIndex: 1,
			data: data.map((row) => finiteValue(row[key])),
			stack: isStacked ? "__mini-total" : undefined,
			smooth: curve.smooth,
			step: curve.step,
			connectNulls: area.connectNulls,
			silent: true,
			showSymbol: false,
			emphasis: { disabled: true },
			tooltip: { show: false },
			lineStyle: {
				color: base,
				width: 1,
				opacity: BRUSH_STROKE_OPACITY * strokeDim,
			},
			areaStyle: {
				color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
					{ offset: 0, color: withAlpha(base, BRUSH_FILL_OPACITY * fillDim) },
					{ offset: 1, color: withAlpha(base, 0) },
				]),
			},
			z: 0,
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
	const curve = curveConfig(ctx.curveType);
	return {
		animation: false,
		grid: frame.grid,
		xAxis: frame.xAxis,
		yAxis: frame.yAxis,
		tooltip: { show: false },
		series: [
			{
				id: "__loading",
				type: "line",
				data: ctx.loadingData(),
				smooth: curve.smooth,
				step: curve.step,
				showSymbol: false,
				silent: true,
				lineStyle: { color: withAlpha(tokens.foreground, 0), width: 1 },
				areaStyle: { color: withAlpha(tokens.foreground, 0) },
				z: 1,
			},
		],
	};
}
type AreaPoint =
	| number
	| null
	| {
			value: number;
			itemStyle: NonNullable<LineSeriesOption["itemStyle"]>;
			emphasis: {
				itemStyle: NonNullable<LineSeriesOption["itemStyle"]>;
			};
	  };
function areaPoints(
	vals: (number | null)[],
	area: AreaSeriesConfig,
	slots: string[],
	background: string,
	dotOpacity: number,
): AreaPoint[] {
	return slots.length <= 1
		? vals
		: vals.map((value, i): AreaPoint => {
				if (value === null) return null;
				const t = vals.length > 1 ? i / (vals.length - 1) : 0;
				const pointColor = sampleGradient(slots, t);
				return {
					value,
					itemStyle: {
						...dotItemStyle(
							area.dotVariant !== "none"
								? area.dotVariant
								: area.activeDotVariant,
							pointColor,
							background,
						),
						opacity: dotOpacity,
					},
					emphasis: {
						itemStyle: {
							...dotItemStyle(
								area.activeDotVariant === "none"
									? "default"
									: area.activeDotVariant,
								pointColor,
								background,
							),
							opacity: 1,
						},
					},
				};
			});
}

function buildAreaSeries(ctx: OptionBuildContext): LineSeriesOption[] {
	const {
		data,
		config,
		areas,
		seriesKeys,
		curveType,
		isStacked,
		isExpanded,
		selectedDataKey,
		hasSelection,
		enableHoverHighlight,
		enableHoverReveal,
		revealIndex,
		revealSink,
		resolved,
		rendererSize,
	} = ctx;
	const rowTotals = isExpanded
		? data.map((row) =>
				finiteSum(seriesKeys.map((key) => finiteValue(row[key]) ?? 0)),
			)
		: [];
	return areas.flatMap((area): LineSeriesOption[] => {
		const key = area.dataKey;
		const slots = resolved.series[key] ?? ["rgba(120, 120, 120, 1)"];
		const paint = seriesPaint(slots);
		const isSelected = selectedDataKey === key;
		const showUnselected = hasSelection && !isSelected;
		const opacity = getOpacity(selectedDataKey, key);
		const curve = curveConfig(area.curveType ?? curveType);
		const values = data.map((row, i) => {
			const value = finiteValue(row[key]);
			if (value === null) return null;
			if (!isExpanded) return value;
			const total = rowTotals[i];
			return total ? value / total : 0;
		});
		const n = values.length;
		const reveal = enableHoverReveal;
		const buffer = !reveal && area.enableBufferLine && n >= 2;
		const revealActive = reveal && revealIndex !== null;
		const restingDot = dotStyle(
			area.dotVariant,
			paint,
			resolved.tokens.background,
		);
		const activeDot = dotStyle(
			area.activeDotVariant,
			paint,
			resolved.tokens.background,
		);
		const restingVisible = area.dotVariant !== "none";
		const dotOpacity = opacity.dot;
		const multiColor = slots.length > 1;
		const strokePaint =
			reveal && multiColor
				? new echarts.graphic.LinearGradient(
						8,
						0,
						Math.max(rendererSize.width - 8, 9),
						0,
						slots.map((color, i) => ({
							offset: i / (slots.length - 1),
							color,
						})),
						true,
					)
				: paint;
		const toPoints = (values: (number | null)[]) =>
			areaPoints(values, area, slots, resolved.tokens.background, dotOpacity);
		if (reveal) revealSink[key] = toPoints(values);
		const mainValues: (number | null)[] = buffer
			? values.map((v, i) => (i === n - 1 ? null : v))
			: revealActive
				? sliceToNull(values, revealIndex as number)
				: values;
		const mainDash: "solid" | [number, number] =
			buffer || area.strokeVariant === "solid"
				? "solid"
				: ([3, 3] as [number, number]);
		const z = isSelected ? 3 : hasSelection ? 1 : 2;
		const mainSeries: LineSeriesOption = {
			id: key,
			name: typeof config[key]?.label === "string" ? config[key]?.label : key,
			type: "line",
			data: toPoints(mainValues),
			stack: isStacked ? "total" : undefined,
			smooth: curve.smooth,
			step: curve.step,
			connectNulls: area.connectNulls,
			cursor: area.isClickable ? "pointer" : "default",
			triggerEvent: area.isClickable,
			showSymbol: restingVisible,
			symbol: "circle",
			symbolSize: restingVisible ? restingDot.size : activeDot.size,
			z,
			lineStyle: {
				color: strokePaint,
				width: area.strokeWidth,
				opacity: opacity.stroke,
				type: mainDash,
				dashOffset: 0,
			},
			itemStyle: multiColor
				? { opacity: dotOpacity }
				: {
						...(restingVisible ? restingDot.itemStyle : activeDot.itemStyle),
						opacity: dotOpacity,
					},
			areaStyle: {
				color: fillPaint(area.variant, showUnselected, slots, rendererSize),
				opacity: opacity.fill,
			},
			emphasis: {
				focus:
					enableHoverHighlight && !enableHoverReveal && !hasSelection
						? "series"
						: "none",
				scale: restingVisible
					? activeDot.size / Math.max(restingDot.size, 1)
					: 1,
				...(multiColor
					? {}
					: { itemStyle: { ...activeDot.itemStyle, opacity: 1 } }),
			},
			blur: {
				lineStyle: { opacity: 0.3 },
				areaStyle: { opacity: 0.1 },
				itemStyle: { opacity: 0.3 },
			},
		};
		if (reveal) {
			const muted = resolved.tokens.mutedForeground;
			const revealBase: LineSeriesOption = {
				id: `${REVEAL_PREFIX}${key}`,
				type: "line",
				data: revealActive ? sliceFrom(values, revealIndex as number) : values,
				stack: isStacked ? "__reveal-total" : undefined,
				smooth: curve.smooth,
				step: curve.step,
				connectNulls: false,
				silent: true,
				showSymbol: false,
				symbol: "circle",
				z: z - 1,
				lineStyle: {
					color: muted,
					width: area.strokeWidth,
					type: mainDash,
					opacity: revealActive ? 0.3 : 0,
				},
				emphasis: { disabled: true },
				blur: { lineStyle: { opacity: revealActive ? 0.3 : 0 } },
				tooltip: { show: false },
			};
			return [revealBase, mainSeries];
		}
		if (!buffer) return [mainSeries];
		return buildBufferSeries(ctx, area, values, mainSeries);
	});
}

function buildBufferSeries(
	ctx: OptionBuildContext,
	area: AreaSeriesConfig,
	values: (number | null)[],
	mainSeries: LineSeriesOption,
): LineSeriesOption[] {
	const key = area.dataKey;
	const {
		isStacked,
		rendererSize,
		resolved,
		hasSelection,
		selectedDataKey,
		curveType,
	} = ctx;
	const slots = resolved.series[key] ?? ["rgba(120, 120, 120, 1)"];
	const paint = seriesPaint(slots);
	const opacity = getOpacity(selectedDataKey, key);
	const dotOpacity = opacity.dot;
	const curve = curveConfig(area.curveType ?? curveType);
	const showUnselected = hasSelection && selectedDataKey !== key;
	const restingVisible = area.dotVariant !== "none";
	const restingDot = dotStyle(
		area.dotVariant,
		paint,
		resolved.tokens.background,
	);
	const activeDot = dotStyle(
		area.activeDotVariant,
		paint,
		resolved.tokens.background,
	);
	const multiColor = slots.length > 1;
	const z = mainSeries.z ?? 2;
	const toPoints = (values: (number | null)[]) =>
		areaPoints(values, area, slots, resolved.tokens.background, dotOpacity);
	const bufferValues: (number | null)[] = values.map((v, i) =>
		i >= values.length - 2 ? v : null,
	);
	const bufferSeries: LineSeriesOption = {
		id: `${BUFFER_PREFIX}${key}`,
		type: "line",
		data: toPoints(bufferValues),
		stack: isStacked ? "__buffer-total" : undefined,
		smooth: curve.smooth,
		step: curve.step,
		connectNulls: true,
		silent: true,
		showSymbol: restingVisible,
		symbol: "circle",
		symbolSize: restingVisible ? restingDot.size : activeDot.size,
		z,
		lineStyle: {
			color: paint,
			width: area.strokeWidth,
			opacity: opacity.stroke,
			type: [...BUFFER_DASH],
		},
		itemStyle: multiColor
			? { opacity: dotOpacity }
			: {
					...(restingVisible ? restingDot.itemStyle : activeDot.itemStyle),
					opacity: dotOpacity,
				},
		emphasis: {
			focus: "none",
			scale: false,
			lineStyle: { opacity: opacity.stroke },
			itemStyle: { opacity: dotOpacity },
		},
		blur: { lineStyle: { opacity: 0.3 }, itemStyle: { opacity: 0.3 } },
	};
	const bufferFillSeries: LineSeriesOption = {
		id: `${BUFFERFILL_PREFIX}${key}`,
		type: "line",
		data: toPoints(bufferValues),
		stack: isStacked ? "__bufferfill-total" : undefined,
		smooth: curve.smooth,
		step: curve.step,
		connectNulls: true,
		silent: true,
		showSymbol: false,
		z: z - 1,
		lineStyle: { opacity: 0 },
		areaStyle: {
			color: fillPaint(area.variant, showUnselected, slots, rendererSize),
			opacity: opacity.fill,
		},
		emphasis: { disabled: true },
		blur: { areaStyle: { opacity: 0.1 } },
		tooltip: { show: false },
	};
	return [mainSeries, bufferSeries, bufferFillSeries];
}

function sliceToNull<T>(vals: readonly T[], idx: number): (T | null)[] {
	return vals.map((v, i) => (i > idx ? null : v));
}
function sliceFrom<T>(vals: readonly T[], idx: number): (T | null)[] {
	return vals.map((v, i) => (i < idx ? null : v));
}
function computePlottedTops(
	ctx: OptionBuildContext,
): Record<string, (number | null)[]> {
	const { data, areas, seriesKeys, isStacked, isExpanded } = ctx;
	const rowTotals = isExpanded
		? data.map((row) =>
				finiteSum(seriesKeys.map((key) => finiteValue(row[key]) ?? 0)),
			)
		: [];
	const running = new Array(data.length).fill(0);
	const tops: Record<string, (number | null)[]> = {};
	for (const area of areas) {
		const key = area.dataKey;
		tops[key] = data.map((row, i) => {
			let value = finiteValue(row[key]);
			if (value === null) return null;
			if (isExpanded) value = rowTotals[i] ? value / rowTotals[i] : 0;
			if (!isStacked) return value;
			running[i] = (running[i] ?? 0) + value;
			return running[i];
		});
	}
	return tops;
}
function resolveAreaAtPixel(
	chart: EChartsInstance,
	tops: Record<string, (number | null)[]>,
	keys: string[],
	x: number,
	y: number,
): string | null {
	if (keys.length < 2) return null;
	if (!chart.containPixel({ gridIndex: 0 }, [x, y])) return null;
	const [rawIndex] = chart.convertFromPixel({ gridIndex: 0 }, [x, y]);
	if (rawIndex === undefined || !Number.isFinite(rawIndex)) return null;
	const index = Math.round(rawIndex);
	let nearest: string | null = null;
	let nearestDist = Infinity;
	let above: string | null = null;
	let abovePixelY = -Infinity;
	for (const key of keys) {
		const value = tops[key]?.[index];
		if (value == null) continue;
		const pixelY = chart.convertToPixel({ gridIndex: 0 }, [index, value])[1];
		if (pixelY === undefined || !Number.isFinite(pixelY)) continue;
		const dist = Math.abs(pixelY - y);
		if (dist < nearestDist) {
			nearestDist = dist;
			nearest = key;
		}
		if (pixelY <= y && pixelY > abovePixelY) {
			abovePixelY = pixelY;
			above = key;
		}
	}
	return nearestDist <= 10 ? nearest : above;
}
type LiveState = {
	resolved: ResolvedColors | null;
	hoveredKey: string | null;
	pointerIndex: number | null;
	syncActive: () => void;
	hasRevealed: boolean;
	revealEndsAt: number;
	loadingRows: number[] | null;
	categories: string[];
	dataLength: number;
	plottedTops: Record<string, (number | null)[]>;
	seriesKeyByIndex: (string | undefined)[];
	companionIdsByKey: Map<string, string[]>;
	revealIndex: number | null;
	revealValues: Record<string, unknown[]>;
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
		onSelectionChange?: (key: string | null) => void;
		clickableKeys: Set<string>;
		selectedDataKey: string | null;
		brushFormatLabel?: (value: string, index: number) => string;
		seriesKeys: string[];
		enableHoverHighlight: boolean;
		enableHoverReveal: boolean;
		onHoverIndexChange?: (index: number | null) => void;
	};
	repush: () => void;
};
export function EChartsAreaChart<TData extends ChartRow>({
	data,
	config,
	renderer = DEFAULT_ECHARTS_RENDERER,
	xDataKey,
	className,
	curveType = "linear",
	stackType = "default",
	animation = true,
	animationType = "left-to-right",
	enableHoverHighlight = false,
	enableHoverReveal = false,
	defaultSelectedDataKey = null,
	selectedDataKey: selectedDataKeyProp,
	onSelectionChange,
	isLoading = false,
	loadingPoints = LOADING_DEFAULT_POINTS,
	chartOptions,
	activeIndex,
	onHoverIndexChange,
	children,
}: EChartsAreaChartProps<TData>) {
	const rawId = useId();
	const chartId = `chart-${rawId.replace(/:/g, "")}`;
	const containerRef = useRef<HTMLDivElement>(null);
	const mountRef = useRef<HTMLDivElement>(null);
	const echartsRef = useRef<EChartsInstance | null>(null);
	const live = useRef<LiveState>({
		resolved: null,
		hoveredKey: null,
		pointerIndex: null,
		syncActive: () => {},
		hasRevealed: false,
		revealEndsAt: 0,
		loadingRows: null,
		categories: [],
		dataLength: 0,
		plottedTops: {},
		seriesKeyByIndex: [],
		companionIdsByKey: new Map<string, string[]>(),
		revealIndex: null,
		revealValues: {},
		brushRange: { start: 0, end: 100 },
		brushGeom: null,
		brushOverlay: null,
		brushHover: { inside: false, left: false, right: false },
		handlers: {
			onBrushChange: undefined,
			onSelectionChange,
			clickableKeys: new Set<string>(),
			selectedDataKey: defaultSelectedDataKey,
			brushFormatLabel: undefined,
			seriesKeys: [],
			enableHoverHighlight,
			enableHoverReveal,
		},
		repush: () => {},
	}).current;
	const loadingData = useCallback(
		() => (live.loadingRows ??= getLoadingData(loadingPoints)),
		[live, loadingPoints],
	);
	const shouldReduceMotion = useReducedMotion();
	const [internalSelectedKey, setSelectedDataKey] = useState<string | null>(
		defaultSelectedDataKey,
	);
	const selectedDataKey =
		selectedDataKeyProp !== undefined
			? selectedDataKeyProp
			: internalSelectedKey;
	const [hoveredDataKey, setHoveredDataKey] = useState<string | null>(null);
	const collected = useMemo(() => collectConfig(children), [children]);
	const {
		areas,
		xAxis: xAxisSlot,
		yAxis: yAxisSlot,
		showGrid,
		tooltip: tooltipSlot,
		legend: legendSlot,
		brush: brushSlot,
	} = collected;
	const showBrush = brushSlot.present;
	const brushHeight = brushSlot.height ?? 56;
	const seriesKeys = useMemo(() => areas.map((area) => area.dataKey), [areas]);
	const xCategoryKey = useMemo(() => {
		if (xAxisSlot.dataKey) return xAxisSlot.dataKey;
		if (xDataKey) return xDataKey as string;
		const firstRow = data[0];
		if (firstRow) {
			const claimed = new Set(seriesKeys);
			const found = Object.keys(firstRow).find((key) => !claimed.has(key));
			if (found) return found;
		}
		return "";
	}, [xAxisSlot.dataKey, xDataKey, data, seriesKeys]);
	const effectiveAnimation = areas[0]?.animationType ?? animationType;
	const css = useMemo(() => buildChartCss(chartId, config), [chartId, config]);
	const hasSelection = selectedDataKey !== null;
	const isExpanded = stackType === "expanded";
	const isStacked = stackType === "stacked" || isExpanded;
	const clickableKeys = useMemo(
		() =>
			new Set(
				areas.filter((area) => area.isClickable).map((area) => area.dataKey),
			),
		[areas],
	);

	const toggleSelection = useCallback(
		(key: string) => {
			const next = live.handlers.selectedDataKey === key ? null : key;
			if (next !== null && live.hoveredKey !== null) {
				const previous = live.hoveredKey;
				live.hoveredKey = null;
				setHoveredDataKey(null);
				echartsRef.current?.dispatchAction({
					type: "downplay",
					seriesIndex: live.handlers.seriesKeys.indexOf(previous),
				});
			}
			setSelectedDataKey(next);
			live.handlers.onSelectionChange?.(next);
		},
		[live],
	);
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
		const categories = data.map((row) => String(row[xCategoryKey]));
		live.categories = categories;
		const revealSink: Record<string, unknown[]> = {};
		const ctx: OptionBuildContext = {
			data,
			config,
			areas,
			seriesKeys,
			curveType,
			isStacked,
			isExpanded,
			selectedDataKey,
			hasSelection,
			showGrid,
			xAxisSlot,
			yAxisSlot,
			tooltipSlot,
			legendSlot,
			isLoading,
			loadingData,
			showBrush,
			brushHeight,
			enableHoverHighlight,
			enableHoverReveal,
			revealIndex: live.revealIndex,
			resolved,
			rendererSize: {
				width:
					echartsRef.current?.getWidth() ?? mountRef.current?.clientWidth ?? 0,
				height:
					echartsRef.current?.getHeight() ??
					mountRef.current?.clientHeight ??
					0,
			},
			categories,
			brushRange: live.brushRange,
			getHoveredKey: () => live.hoveredKey,
			revealSink,
		};
		live.plottedTops = computePlottedTops(ctx);
		const { grid, brushBottom } = buildChartLayout(ctx);
		live.brushGeom = showBrush
			? { bottom: brushBottom, height: brushHeight }
			: null;
		const { xAxis, yAxis } = buildMainAxes(ctx);
		if (isLoading) return buildLoadingOption(ctx, { grid, xAxis, yAxis });
		const brush = showBrush ? buildBrushOption(ctx, brushBottom) : null;
		const series = [...buildAreaSeries(ctx), ...(brush?.miniSeries ?? [])];
		if (enableHoverReveal) live.revealValues = revealSink;
		live.seriesKeyByIndex = series.map((s) => {
			const id = String(s.id ?? "");
			return id && !id.startsWith("__") ? id : undefined;
		});
		const companionIdsByKey = new Map<string, string[]>();
		for (const area of areas) {
			const ids: string[] = [];
			if (area.enableBufferLine && data.length >= 2) {
				ids.push(
					`${BUFFER_PREFIX}${area.dataKey}`,
					`${BUFFERFILL_PREFIX}${area.dataKey}`,
				);
			}
			if (enableHoverReveal) ids.push(`${REVEAL_PREFIX}${area.dataKey}`);
			if (ids.length) companionIdsByKey.set(area.dataKey, ids);
		}
		live.companionIdsByKey = companionIdsByKey;
		return {
			animation: false,
			grid: brush ? [grid, brush.miniGrid] : grid,
			xAxis: brush ? [xAxis, brush.miniXAxis] : xAxis,
			yAxis: brush ? [yAxis, brush.miniYAxis] : yAxis,
			tooltip: buildTooltipOption(ctx),
			dataZoom: brush?.dataZoom,
			series,
		};
	}, [
		live,
		data,
		config,
		areas,
		seriesKeys,
		xCategoryKey,
		curveType,
		isStacked,
		isExpanded,
		selectedDataKey,
		hasSelection,
		showGrid,
		xAxisSlot,
		yAxisSlot,
		tooltipSlot,
		legendSlot,
		isLoading,
		loadingData,
		showBrush,
		brushHeight,
		enableHoverHighlight,
		enableHoverReveal,
	]);
	const setupChart = useCallback(() => {
		const mount = mountRef.current;
		const container = containerRef.current;
		if (!mount || !container) return;
		live.hoveredKey = null;
		live.revealIndex = null;
		live.pointerIndex = null;
		live.brushHover = { inside: false, left: false, right: false };
		setHoveredDataKey(null);
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
		chart.on("click", (params) => {
			const { clickableKeys: clickable, seriesKeys: keys } = live.handlers;
			const p = params as {
				seriesId?: string;
				seriesIndex?: number;
				event?: {
					offsetX?: number;
					offsetY?: number;
				};
			};
			let id =
				p.seriesId ??
				(typeof p.seriesIndex === "number"
					? live.seriesKeyByIndex[p.seriesIndex]
					: undefined);
			if (
				typeof p.event?.offsetX === "number" &&
				typeof p.event?.offsetY === "number"
			) {
				const resolved = resolveAreaAtPixel(
					chart,
					live.plottedTops,
					keys,
					p.event.offsetX,
					p.event.offsetY,
				);
				if (resolved) id = resolved;
			}
			if (typeof id === "string" && clickable.has(id)) toggleSelection(id);
		});
		const applyHoverKey = (key: string | null) => {
			if (live.hoveredKey === key) return;
			const previous = live.hoveredKey;
			live.hoveredKey = key;
			setHoveredDataKey(key);
			if (previous) {
				chart.dispatchAction({ type: "downplay", seriesId: previous });
				for (const id of live.companionIdsByKey.get(previous) ?? [])
					chart.dispatchAction({ type: "downplay", seriesId: id });
			}
			if (key) {
				chart.dispatchAction({ type: "highlight", seriesId: key });
				for (const id of live.companionIdsByKey.get(key) ?? [])
					chart.dispatchAction({ type: "highlight", seriesId: id });
			}
		};
		const pushReveal = (idx: number | null) => {
			const keys = live.handlers.seriesKeys;
			const on = idx !== null;
			chart.setOption(
				{
					series: keys.flatMap((key) => [
						{
							id: key,
							data: on
								? sliceToNull(live.revealValues[key] ?? [], idx)
								: (live.revealValues[key] ?? []),
						},
						{
							id: `${REVEAL_PREFIX}${key}`,
							data: on
								? sliceFrom(live.revealValues[key] ?? [], idx)
								: (live.revealValues[key] ?? []),
							lineStyle: { opacity: on ? 0.3 : 0 },
						},
					]),
				},
				{ silent: true },
			);
			for (const key of keys) {
				chart.dispatchAction(
					on
						? { type: "highlight", seriesId: key, dataIndex: idx as number }
						: { type: "downplay", seriesId: key },
				);
			}
		};
		const applyReveal = (event: { offsetX?: number; offsetY?: number }) => {
			const len = live.dataLength;
			if (len < 1) return;
			const x = event.offsetX ?? -1;
			const y = event.offsetY ?? -1;
			if (!chart.containPixel({ gridIndex: 0 }, [x, y])) {
				clearReveal();
				return;
			}
			const raw = chart.convertFromPixel({ gridIndex: 0 }, [x, y])[0];
			if (raw === undefined || !Number.isFinite(raw)) return;
			const idx = Math.max(0, Math.min(len - 1, Math.round(raw)));
			if (idx === live.revealIndex) return;
			live.revealIndex = idx;
			pushReveal(idx);
		};
		const clearReveal = () => {
			if (live.revealIndex === null) return;
			live.revealIndex = null;
			pushReveal(null);
		};
		const zrHover = chart.getZr();
		const notifyHoverIndex = (index: number | null) => {
			if (index === live.pointerIndex) return;
			live.pointerIndex = index;
			live.handlers.onHoverIndexChange?.(index);
			live.syncActive();
		};
		const onZrHoverMove = (event: { offsetX?: number; offsetY?: number }) => {
			const point = [event.offsetX ?? -1, event.offsetY ?? -1];
			const index = chart.containPixel({ gridIndex: 0 }, point)
				? chart.convertFromPixel({ gridIndex: 0 }, point)[0]
				: null;
			notifyHoverIndex(
				boundedIndex(
					typeof index === "number" ? Math.round(index) : null,
					live.dataLength,
				),
			);
			if (live.handlers.enableHoverReveal) {
				applyReveal(event);
				return;
			}
			if (!live.handlers.enableHoverHighlight) return;
			if (live.handlers.selectedDataKey !== null) return;
			applyHoverKey(
				resolveAreaAtPixel(
					chart,
					live.plottedTops,
					live.handlers.seriesKeys,
					event.offsetX ?? -1,
					event.offsetY ?? -1,
				),
			);
		};
		const onZrHoverOut = () => {
			notifyHoverIndex(null);
			if (live.handlers.enableHoverReveal) clearReveal();
			else if (live.handlers.enableHoverHighlight) applyHoverKey(null);
		};
		zrHover.on("mousemove", onZrHoverMove);
		zrHover.on("globalout", onZrHoverOut);
		chart.on("mouseover", (params) => {
			const { enableHoverHighlight: hoverOn, enableHoverReveal: revealOn } =
				live.handlers;
			if (!hoverOn || revealOn) return;
			if (live.handlers.selectedDataKey !== null) return;
			const p = params as {
				seriesIndex?: number;
				componentType?: string;
			};
			if (p.componentType !== "series" || typeof p.seriesIndex !== "number")
				return;
			const key = live.seriesKeyByIndex[p.seriesIndex];
			if (!key || key.startsWith("__")) return;
			if (key !== live.hoveredKey) {
				chart.dispatchAction({ type: "downplay", seriesIndex: p.seriesIndex });
				if (live.hoveredKey) {
					chart.dispatchAction({
						type: "highlight",
						seriesId: live.hoveredKey,
					});
				}
			}
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
			zrHover.off("mousemove", onZrHoverMove);
			zrHover.off("globalout", onZrHoverOut);
			zr.off("mousemove", onZrMove);
			zr.off("globalout", onZrOut);
			resizeObserver.disconnect();
			themeObserver.disconnect();
			cancelActiveTooltip(chart);
			chart.off();
			chart.getZr().off();
			chart.dispose();
			live.repush = () => {};
			live.syncActive = () => {};
			echartsRef.current = null;
			live.brushOverlay = null;
			live.hasRevealed = false;
		};
	}, [renderer]);
	const synchronizeChart = useCallback(() => {
		const chart = echartsRef.current;
		const container = containerRef.current;
		if (!chart || !container) return;
		live.resolved = resolveColors(container, config, seriesKeys);
		live.syncActive = () => {
			if (activeIndex !== undefined || live.pointerIndex !== null) {
				showActiveIndex(
					chart,
					isLoading
						? null
						: boundedIndex(live.pointerIndex ?? activeIndex, data.length),
					seriesKeys[0],
				);
			}
		};
		const push = (withEntrance: boolean) => {
			const option = buildOption();
			const merged = chartOptions ? { ...option, ...chartOptions } : option;
			Object.assign(merged, {
				animation: withEntrance,
				animationDuration: REVEAL_DURATION,
				animationDurationUpdate: 0,
			});
			setChartOption(chart, merged);
			live.syncActive();
			syncBrushOverlayNow();
		};
		if (isLoading) live.hasRevealed = false;
		const shouldReveal = !live.hasRevealed && !isLoading;
		if (shouldReveal) live.hasRevealed = true;
		const revealEnabled =
			animation &&
			shouldReveal &&
			effectiveAnimation !== "none" &&
			!shouldReduceMotion;
		if (revealEnabled) live.revealEndsAt = performance.now() + REVEAL_DURATION;
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
		syncBrushOverlayNow,
	]);
	const animatePrimary = useCallback(() => {
		const chart = echartsRef.current;
		if (!chart || isLoading || shouldReduceMotion) return;
		const animatedKeys = areas
			.filter(
				(area) =>
					area.strokeVariant === "animated-dashed" && !area.enableBufferLine,
			)
			.map((area) => area.dataKey);
		if (animatedKeys.length === 0 || hasSelection) return;
		let raf = 0;
		let delayTimer: ReturnType<typeof setTimeout> | undefined;
		const begin = () => {
			const loopStart = performance.now();
			const tick = (now: number) => {
				const offset = -(((now - loopStart) / 1000) % 1) * 6;
				chart.setOption(
					{
						series: animatedKeys.map((id) => ({
							id,
							lineStyle: { dashOffset: offset },
						})),
					},
					{ silent: true, lazyUpdate: true },
				);
				raf = requestAnimationFrame(tick);
			};
			raf = requestAnimationFrame(tick);
		};
		const delay = Math.max(0, live.revealEndsAt - performance.now());
		if (delay > 0) delayTimer = setTimeout(begin, delay + 50);
		else begin();
		return () => {
			if (delayTimer !== undefined) clearTimeout(delayTimer);
			cancelAnimationFrame(raf);
		};
	}, [renderer, live, areas, hasSelection, isLoading, shouldReduceMotion]);
	const animateLoading = useCallback(() => {
		const chart = echartsRef.current;
		if (!chart || !isLoading || shouldReduceMotion) return;
		let raf = 0;
		let lastPhase = 0;
		const start = performance.now();
		const tick = (now: number) => {
			const phase =
				((((now - start) / LOADING_ANIMATION_DURATION) % 1) + 1) % 1;
			if (phase < lastPhase) live.loadingRows = getLoadingData(loadingPoints);
			lastPhase = phase;
			const foreground =
				live.resolved?.tokens.foreground ?? "rgba(120, 120, 120, 1)";
			const w = chart.getWidth();
			const h = chart.getHeight();
			if (!w || !h) {
				raf = requestAnimationFrame(tick);
				return;
			}
			const maxT = (w + h) / (2 * w);
			const center =
				phase * (maxT + 2 * LOADING_SHIMMER_BAND) - LOADING_SHIMMER_BAND;
			const clip = (peak: number) =>
				new echarts.graphic.LinearGradient(
					0,
					0,
					w,
					w,
					shimmerWindowStops(center, foreground, peak),
					true,
				);
			chart.setOption(
				{
					series: [
						{
							id: "__loading",
							data: loadingData(),
							lineStyle: { color: clip(LOADING_STROKE_OPACITY), width: 1 },
							areaStyle: { color: clip(LOADING_SHIMMER_MAX_OPACITY) },
						},
					],
				},
				{ silent: true, lazyUpdate: true },
			);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [
		renderer,
		live,
		isLoading,
		loadingPoints,
		loadingData,
		shouldReduceMotion,
	]);
	const commitChart = useChartLifecycle(
		{
			prepare: () => {
				live.handlers = {
					onBrushChange: brushSlot.onChange,
					onHoverIndexChange,
					onSelectionChange,
					clickableKeys,
					selectedDataKey,
					brushFormatLabel: brushSlot.formatLabel,
					seriesKeys,
					enableHoverHighlight,
					enableHoverReveal,
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
				? { bottom: showBrush ? brushHeight + 16 : 12 }
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
					hoveredKey={hoveredDataKey}
					isClickable={legendSlot.isClickable}
					onToggle={toggleSelection}
					style={legendStyle}
				/>
			)}
		</div>
	);
}
EChartsAreaChart.Area = Area;
EChartsAreaChart.Dot = Dot;
EChartsAreaChart.ActiveDot = ActiveDot;
EChartsAreaChart.XAxis = XAxis;
EChartsAreaChart.YAxis = YAxis;
EChartsAreaChart.Grid = Grid;
EChartsAreaChart.Tooltip = Tooltip;
EChartsAreaChart.Legend = Legend;
EChartsAreaChart.Brush = Brush;
