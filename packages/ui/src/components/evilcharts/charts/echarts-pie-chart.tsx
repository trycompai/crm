"use client";
import { PieChart, type PieSeriesOption } from "echarts/charts";
import {
	TooltipComponent,
	type TooltipComponentOption,
} from "echarts/components";
import type { ComposeOption } from "echarts/core";
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
	buildChartCss,
	type ChartConfig,
	type ChartRow,
	DEFAULT_ECHARTS_RENDERER,
	type EChartsRenderer,
	finiteValue,
	getColorsCount,
	type ResolvedColors,
	resolveColors,
	withAlpha,
} from "../ui/echarts-chart";
import { ECHARTS_CONFIG } from "../ui/echarts-config";
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
	resolveTooltipPosition,
	roundnessClass,
	type TooltipPosition,
	type TooltipRoundness,
	type TooltipVariant,
	tooltipIndicatorHtml,
	tooltipRow,
	tooltipVariantClass,
} from "../ui/echarts-tooltip";

export type {
	ChartConfig,
	EChartsRenderer,
	LegendVariant,
	TooltipPosition,
	TooltipRoundness,
	TooltipVariant,
};

echarts.use([PieChart, TooltipComponent]);
type EChartsInstance = ReturnType<typeof echarts.init>;
type EChartsOption = ComposeOption<PieSeriesOption | TooltipComponentOption>;
type PieItemStyle = {
	color: string | echarts.graphic.LinearGradient;
	opacity: number;
	borderRadius: number;
	borderColor?: string;
	borderWidth?: number;
};
const {
	REVEAL_DURATION,
	LOADING_ANIMATION_DURATION,
	LOADING_SECTORS,
	DEFAULT_INNER_RADIUS,
	DEFAULT_OUTER_RADIUS,
	DEFAULT_CORNER_RADIUS,
	DEFAULT_PADDING_ANGLE,
	DEFAULT_START_ANGLE,
	DEFAULT_END_ANGLE,
	FALLBACK_COLOR,
	OVERLAP_BORDER_WIDTH,
	SELECTED_OFFSET,
	DIMMED_OPACITY,
	LOADING_BASE_OPACITY,
	LOADING_PEAK_OPACITY,
	LOADING_SHIMMER_BAND,
	LOADING_SHIMMER_FEATHER,
} = ECHARTS_CONFIG.pie;

function gapBorderWidth(paddingAngle: number): number {
	return Math.max(paddingAngle, 0);
}
function sectorBorder(
	paddingAngle: number,
	background: string,
): {
	borderColor: string;
	borderWidth: number;
} | null {
	if (paddingAngle < 0)
		return { borderColor: background, borderWidth: OVERLAP_BORDER_WIDTH };
	const width = gapBorderWidth(paddingAngle);
	if (width > 0) return { borderColor: background, borderWidth: width };
	return null;
}

export type PieVariant = "gradient";
export type LabelPosition = "inside" | "outside";
export type BackgroundVariant =
	| "dots"
	| "grid"
	| "cross-hatch"
	| "diagonal-lines"
	| "plus"
	| "falling-triangles"
	| "4-pointed-star"
	| "tiny-checkers"
	| "overlapping-circles"
	| "wiggle-lines"
	| "bubbles";
export interface EChartsPieChartProps<TData extends ChartRow> {
	data: TData[];
	config: ChartConfig;
	dataKey: keyof TData & string;
	nameKey: keyof TData & string;
	className?: string;
	renderer?: EChartsRenderer;
	animation?: boolean;
	defaultSelectedSector?: string | null;
	selectedSector?: string | null;
	onSelectionChange?: (
		selection: {
			dataKey: string;
			value: number;
		} | null,
	) => void;
	isLoading?: boolean;
	chartOptions?: EChartsOption;
	activeSector?: string | null;
	children?: ReactNode;
}
export interface PieProps {
	variant?: PieVariant;
	innerRadius?: number | string;
	outerRadius?: number | string;
	cornerRadius?: number;
	paddingAngle?: number;
	startAngle?: number;
	endAngle?: number;
	isClickable?: boolean;
	children?: ReactNode;
}
const Pie: FC<PieProps> = () => null;
export interface LabelProps {
	dataKey?: string;
	position?: LabelPosition;
}
const Label: FC<LabelProps> = () => null;
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
export interface BackgroundProps {
	variant?: BackgroundVariant;
}
const Background: FC<BackgroundProps> = () => null;
type PieSlot = {
	variant: PieVariant;
	innerRadius: number | string;
	outerRadius: number | string;
	cornerRadius: number;
	paddingAngle: number;
	startAngle: number;
	endAngle: number;
	isClickable: boolean;
	labelDataKey: string | null;
	labelPosition: LabelPosition;
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
type BackgroundSlot = {
	present: boolean;
	variant: BackgroundVariant;
};
type CollectedConfig = {
	pie: PieSlot | null;
	tooltip: TooltipSlot;
	legend: LegendSlot;
	background: BackgroundSlot;
};
function collectConfig(children: ReactNode): CollectedConfig {
	let pie: PieSlot | null = null;
	let tooltip: TooltipSlot = {
		present: false,
		variant: "default",
		roundness: "lg",
		position: "variable",
	};
	let legend: LegendSlot = {
		present: false,
		variant: "rounded-square",
		align: "center",
		verticalAlign: "bottom",
		isClickable: false,
	};
	let background: BackgroundSlot = { present: false, variant: "dots" };
	Children.forEach(children, (child) => {
		if (!isValidElement(child)) return;
		const type = child.type;
		if (type === Pie) {
			const props = child.props as PieProps;
			let labelDataKey: string | null = null;
			let labelPosition: LabelPosition = "inside";
			Children.forEach(props.children, (labelChild) => {
				if (!isValidElement(labelChild) || labelChild.type !== Label) return;
				const labelProps = labelChild.props as LabelProps;
				labelDataKey = labelProps.dataKey ?? "";
				labelPosition = labelProps.position ?? "inside";
			});
			pie = {
				variant: props.variant ?? "gradient",
				innerRadius: props.innerRadius ?? DEFAULT_INNER_RADIUS,
				outerRadius: props.outerRadius ?? DEFAULT_OUTER_RADIUS,
				cornerRadius: props.cornerRadius ?? DEFAULT_CORNER_RADIUS,
				paddingAngle: props.paddingAngle ?? DEFAULT_PADDING_ANGLE,
				startAngle: props.startAngle ?? DEFAULT_START_ANGLE,
				endAngle: props.endAngle ?? DEFAULT_END_ANGLE,
				isClickable: props.isClickable ?? false,
				labelDataKey,
				labelPosition,
			};
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
				align: props.align ?? "center",
				verticalAlign: props.verticalAlign ?? "bottom",
				isClickable: props.isClickable ?? false,
			};
		} else if (type === Background) {
			const props = child.props as BackgroundProps;
			background = { present: true, variant: props.variant ?? "dots" };
		}
	});
	return { pie, tooltip, legend, background };
}
function sectorPaint(slots: string[]): string | echarts.graphic.LinearGradient {
	if (slots.length <= 1) return slots[0] ?? FALLBACK_COLOR;
	const stops = slots.map((color, i) => ({
		offset: i / (slots.length - 1),
		color,
	}));
	return new echarts.graphic.LinearGradient(0, 0, 1, 1, stops);
}
function loadingSectorAlpha(pos: number, center: number): number {
	const raw = Math.abs(pos - center);
	const dist = Math.min(raw, 1 - raw);
	const half = LOADING_SHIMMER_BAND;
	const feather = LOADING_SHIMMER_FEATHER;
	if (dist >= half) return LOADING_BASE_OPACITY;
	if (dist <= half - feather) return LOADING_PEAK_OPACITY;
	const t = 1 - (dist - (half - feather)) / feather;
	const eased = Math.sin((t * Math.PI) / 2);
	return (
		LOADING_BASE_OPACITY + (LOADING_PEAK_OPACITY - LOADING_BASE_OPACITY) * eased
	);
}
type PatternProps = {
	id: string;
};
const BACKGROUND_PATTERNS: Record<BackgroundVariant, FC<PatternProps>> = {
	dots: ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="20"
			height="20"
			patternUnits="userSpaceOnUse"
		>
			<circle className="text-border" cx="2" cy="2" r="1" fill="currentColor" />
		</pattern>
	),
	grid: ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="20"
			height="20"
			patternUnits="userSpaceOnUse"
		>
			<path
				className="text-border"
				d="M 20 0 L 0 0 0 20"
				fill="none"
				stroke="currentColor"
				strokeWidth="0.5"
			/>
		</pattern>
	),
	"cross-hatch": ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="20"
			height="20"
			patternUnits="userSpaceOnUse"
		>
			<path
				className="text-border/60 dark:text-border/50"
				d="M 0 0 L 20 20 M 20 0 L 0 20"
				fill="none"
				stroke="currentColor"
				strokeWidth="0.5"
			/>
		</pattern>
	),
	"diagonal-lines": ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="6"
			height="6"
			patternUnits="userSpaceOnUse"
			patternTransform="rotate(45)"
		>
			<line
				className="text-border"
				x1="0"
				y1="0"
				x2="0"
				y2="6"
				stroke="currentColor"
				strokeWidth="0.5"
			/>
		</pattern>
	),
	plus: ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="16"
			height="16"
			patternUnits="userSpaceOnUse"
		>
			<path
				className="text-border"
				d="M 8 4 L 8 12 M 4 8 L 12 8"
				fill="none"
				stroke="currentColor"
				strokeWidth="0.5"
				strokeLinecap="round"
			/>
		</pattern>
	),
	"falling-triangles": ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="18"
			height="36"
			patternUnits="userSpaceOnUse"
		>
			<path
				className="text-border"
				d="M2 6h12L8 18 2 6zm18 36h12l-6 12-6-12z"
				transform="scale(0.5)"
				fill="currentColor"
				fillOpacity="0.4"
			/>
		</pattern>
	),
	"4-pointed-star": ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="16"
			height="16"
			patternUnits="userSpaceOnUse"
		>
			<polygon
				className="text-border"
				fillRule="evenodd"
				points="5 3 8 4 5 5 4 8 3 5 0 4 3 3 4 0 5 3"
				fill="currentColor"
				fillOpacity="0.4"
			/>
		</pattern>
	),
	"tiny-checkers": ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="8"
			height="8"
			patternUnits="userSpaceOnUse"
		>
			<path
				className="text-border"
				fillRule="evenodd"
				d="M0 0h4v4H0V0zm4 4h4v4H4V4z"
				fill="currentColor"
				fillOpacity="0.2"
			/>
		</pattern>
	),
	"overlapping-circles": ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="40"
			height="40"
			patternUnits="userSpaceOnUse"
		>
			<path
				className="text-border"
				fillRule="evenodd"
				d="M25 25c0-2.762 2.238-5 5-5s5 2.238 5 5-2.238 5-5 5c0 2.762-2.238 5-5 5s-5-2.238-5-5 2.238-5 5-5zM5 5c0-2.762 2.238-5 5-5s5 2.238 5 5-2.238 5-5 5c0 2.762-2.238 5-5 5S0 12.762 0 10s2.238-5 5-5zm5 4c2.209 0 4-1.791 4-4s-1.791-4-4-4-4 1.791-4 4 1.791 4 4 4zm20 20c2.209 0 4-1.791 4-4s-1.791-4-4-4-4 1.791-4 4 1.791 4 4 4z"
				fill="currentColor"
				fillOpacity="0.4"
			/>
		</pattern>
	),
	"wiggle-lines": ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="52"
			height="26"
			patternUnits="userSpaceOnUse"
			patternTransform="scale(0.6)"
		>
			<path
				className="text-border"
				d="M10 10c0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6h2c0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4 3.314 0 6 2.686 6 6 0 2.21 1.79 4 4 4v2c-3.314 0-6-2.686-6-6 0-2.21-1.79-4-4-4-3.314 0-6-2.686-6-6zm25.464-1.95l8.486 8.486-1.414 1.414-8.486-8.486 1.414-1.414z"
				fill="currentColor"
				fillOpacity="0.4"
			/>
		</pattern>
	),
	bubbles: ({ id }) => (
		<pattern
			id={id}
			x="0"
			y="0"
			width="100"
			height="100"
			patternUnits="userSpaceOnUse"
			patternTransform="scale(0.6667)"
		>
			<path
				className="text-border"
				d="M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z"
				fill="currentColor"
				fillOpacity="0.4"
				fillRule="evenodd"
			/>
		</pattern>
	),
};
function BackgroundLayer({ variant }: { variant: BackgroundVariant }) {
	const baseId = useId().replace(/:/g, "");
	const patternId = `${baseId}-bg-${variant}`;
	const maskId = `${baseId}-bg-edge-fade`;
	const filterId = `${baseId}-bg-blur`;
	const PatternComponent = BACKGROUND_PATTERNS[variant];
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			aria-hidden
			preserveAspectRatio="none"
		>
			<defs>
				<PatternComponent id={patternId} />

				<filter id={filterId}>
					<feGaussianBlur stdDeviation="25" />
				</filter>
				<mask id={maskId} maskUnits="userSpaceOnUse">
					<rect
						x="8%"
						y="20%"
						width="85%"
						height="60%"
						fill="white"
						filter={`url(#${filterId})`}
					/>
				</mask>
			</defs>
			<rect
				width="100%"
				height="100%"
				fill={`url(#${patternId})`}
				mask={`url(#${maskId})`}
			/>
		</svg>
	);
}
type OptionBuildContext = {
	data: ChartRow[];
	config: ChartConfig;
	nameKey: string;
	dataKey: string;
	pie: PieSlot | null;
	selectedSector: string | null;
	tooltipSlot: TooltipSlot;
	legendSlot: LegendSlot;
	isLoading: boolean;
	resolved: ResolvedColors;
};
function pieCenterY(legendSlot: LegendSlot): string {
	if (!legendSlot.present) return "50%";
	if (legendSlot.verticalAlign === "bottom") return "45%";
	if (legendSlot.verticalAlign === "top") return "55%";
	return "50%";
}
function createTooltipFormatter(ctx: OptionBuildContext) {
	const { config, selectedSector, tooltipSlot } = ctx;
	return (params: unknown): string => {
		const p = (Array.isArray(params) ? params[0] : params) as {
			name?: string;
			value?: number | string;
			seriesId?: string;
		} | null;
		if (!p || String(p.seriesId ?? "").startsWith("__")) return "";
		const name = String(p.name ?? "");
		const item = config[name];
		const colorsCount = item ? getColorsCount(item) : 1;
		const labelText = typeof item?.label === "string" ? item.label : name;
		const value =
			typeof p.value === "number"
				? (tooltipSlot.valueFormatter?.(p.value) ?? p.value.toLocaleString())
				: String(p.value ?? "");
		const dimmed =
			selectedSector != null && selectedSector !== name ? " opacity-30" : "";
		const row = tooltipRow({
			indicatorHtml: tooltipIndicatorHtml(name, colorsCount),
			labelText,
			valueText: value,
			dimmed,
		});
		return `<div class="grid w-max min-w-32 items-start gap-1.5 border border-border/50 px-2.5 py-1.5 text-xs shadow-xl ${roundnessClass[tooltipSlot.roundness]} ${tooltipVariantClass[tooltipSlot.variant]}">
      <div class="grid gap-1.5">${row}</div>
    </div>`;
	};
}
function buildTooltipOption(ctx: OptionBuildContext): TooltipComponentOption {
	const { tooltipSlot, isLoading } = ctx;
	return {
		show: tooltipSlot.present && !isLoading,
		trigger: "item",
		confine: tooltipSlot.position !== "bottom",
		backgroundColor: "transparent",
		borderWidth: 0,
		padding: 0,
		extraCssText: "box-shadow:none;",
		displayTransition: false,
		position: resolveTooltipPosition(tooltipSlot.position),
		formatter: createTooltipFormatter(ctx),
	};
}
function buildPieSeries(ctx: OptionBuildContext): PieSeriesOption[] {
	const {
		data,
		config,
		nameKey,
		dataKey,
		pie,
		selectedSector,
		legendSlot,
		resolved,
	} = ctx;
	if (!pie) return [];
	const { tokens } = resolved;
	const hasSelection = selectedSector !== null;
	const border = sectorBorder(pie.paddingAngle, tokens.background);
	const sectors = data.map((row) => {
		const name = String(row[nameKey]);
		const slots = resolved.series[name] ?? [FALLBACK_COLOR];
		const isSelected = pie.isClickable && selectedSector === name;
		const isDimmed = pie.isClickable && hasSelection && selectedSector !== name;
		const itemStyle: PieItemStyle = {
			color: sectorPaint(slots),
			opacity: isDimmed ? DIMMED_OPACITY : 1,
			borderRadius: pie.cornerRadius,
		};
		if (border) {
			itemStyle.borderColor = border.borderColor;
			itemStyle.borderWidth = border.borderWidth;
		}
		const value: number | "-" = finiteValue(row[dataKey]) ?? "-";
		return { name, value, itemStyle, selected: isSelected };
	});
	const showLabel = pie.labelDataKey !== null;
	const isOutside = pie.labelPosition === "outside";
	const explicitKey = pie.labelDataKey ? pie.labelDataKey : null;
	const labelFormatter = (labelParams: {
		dataIndex: number;
		name?: string;
		value?: unknown;
	}) => {
		if (explicitKey)
			return String(data[labelParams.dataIndex]?.[explicitKey] ?? "");
		if (isOutside) {
			const item = config[String(labelParams.name ?? "")];
			return typeof item?.label === "string"
				? item.label
				: String(labelParams.name ?? "");
		}
		return String(
			data[labelParams.dataIndex]?.[dataKey] ?? labelParams.value ?? "",
		);
	};
	const label = {
		show: showLabel,
		position: (isOutside ? "outside" : "inner") as "outside" | "inner",
		color: isOutside ? tokens.mutedForeground : tokens.background,
		fontSize: 12,
		fontWeight: 500,
		formatter: labelFormatter,
	};
	return [
		{
			id: "pie",
			type: "pie",
			center: ["50%", pieCenterY(legendSlot)],
			radius: [pie.innerRadius, pie.outerRadius],
			startAngle: pie.startAngle,
			endAngle: pie.endAngle,
			clockwise: false,
			padAngle: Math.min(pie.paddingAngle, 0),
			cursor: pie.isClickable ? "pointer" : "default",
			emphasis: { scale: false },
			selectedMode: pie.isClickable ? "single" : false,
			selectedOffset: SELECTED_OFFSET,
			select: { itemStyle: {} },
			label,
			labelLine: isOutside
				? {
						show: true,
						length: 14,
						length2: 14,
						smooth: false,
						lineStyle: {
							color: withAlpha(tokens.mutedForeground, 0.45),
							width: 1,
						},
					}
				: { show: false },
			data: sectors,
		},
	];
}
function buildLoadingOption(ctx: OptionBuildContext): EChartsOption {
	const { pie, legendSlot, resolved } = ctx;
	const { tokens } = resolved;
	const innerRadius = pie?.innerRadius ?? DEFAULT_INNER_RADIUS;
	const outerRadius = pie?.outerRadius ?? DEFAULT_OUTER_RADIUS;
	const cornerRadius = pie?.cornerRadius ?? DEFAULT_CORNER_RADIUS;
	const paddingAngle = pie?.paddingAngle ?? DEFAULT_PADDING_ANGLE;
	const startAngle = pie?.startAngle ?? DEFAULT_START_ANGLE;
	const endAngle = pie?.endAngle ?? DEFAULT_END_ANGLE;
	const border = sectorBorder(paddingAngle, tokens.background);
	const sectors = Array.from({ length: LOADING_SECTORS }, (_, i) => {
		const itemStyle: PieItemStyle = {
			color: withAlpha(tokens.foreground, LOADING_BASE_OPACITY),
			opacity: 1,
			borderRadius: cornerRadius,
		};
		if (border) {
			itemStyle.borderColor = border.borderColor;
			itemStyle.borderWidth = border.borderWidth;
		}
		return { name: `__loading-${i}`, value: 1, itemStyle };
	});
	return {
		animation: false,
		tooltip: { show: false },
		series: [
			{
				id: "__loading",
				type: "pie",
				center: ["50%", pieCenterY(legendSlot)],
				radius: [innerRadius, outerRadius],
				startAngle,
				endAngle,
				clockwise: false,
				padAngle: Math.min(paddingAngle, 0),
				silent: true,
				emphasis: { scale: false },
				label: { show: false },
				labelLine: { show: false },
				data: sectors,
			},
		],
	};
}
type LiveState = {
	resolved: ResolvedColors | null;
	hasRevealed: boolean;
	handlers: {
		isClickable: boolean;
		selectedSector: string | null;
		selectSector: (name: string | null) => void;
	};
	repush: () => void;
};
export function EChartsPieChart<TData extends ChartRow>({
	data,
	config,
	dataKey,
	nameKey,
	className,
	renderer = DEFAULT_ECHARTS_RENDERER,
	animation = true,
	defaultSelectedSector = null,
	selectedSector: selectedSectorProp,
	onSelectionChange,
	isLoading = false,
	chartOptions,
	activeSector,
	children,
}: EChartsPieChartProps<TData>) {
	const rawId = useId();
	const chartId = `chart-${rawId.replace(/:/g, "")}`;
	const containerRef = useRef<HTMLDivElement>(null);
	const mountRef = useRef<HTMLDivElement>(null);
	const echartsRef = useRef<EChartsInstance | null>(null);
	const live = useRef<LiveState>({
		resolved: null,
		hasRevealed: false,
		handlers: {
			isClickable: false,
			selectedSector: defaultSelectedSector,
			selectSector: () => {},
		},
		repush: () => {},
	}).current;
	const shouldReduceMotion = useReducedMotion();
	const [internalSelectedSector, setSelectedSector] = useState<string | null>(
		defaultSelectedSector,
	);
	const selectedSector =
		selectedSectorProp !== undefined
			? selectedSectorProp
			: internalSelectedSector;
	const collected = useMemo(() => collectConfig(children), [children]);
	const {
		pie,
		tooltip: tooltipSlot,
		legend: legendSlot,
		background: backgroundSlot,
	} = collected;
	const sectorKeys = useMemo(
		() => data.map((row) => String(row[nameKey as string])),
		[data, nameKey],
	);
	const css = useMemo(() => buildChartCss(chartId, config), [chartId, config]);
	const selectSector = useCallback(
		(name: string | null) => {
			if (name === null) {
				setSelectedSector(null);
				onSelectionChange?.(null);
				return;
			}
			const item = data.find((row) => String(row[nameKey]) === name);
			const value = finiteValue(item?.[dataKey]);
			if (value === null) return;
			setSelectedSector(name);
			onSelectionChange?.({ dataKey: name, value });
		},
		[data, dataKey, nameKey, onSelectionChange],
	);

	const buildOption = useCallback((): EChartsOption => {
		const resolved = live.resolved;
		if (!resolved) return {};
		const ctx: OptionBuildContext = {
			data,
			config,
			nameKey: nameKey as string,
			dataKey: dataKey as string,
			pie,
			selectedSector,
			tooltipSlot,
			legendSlot,
			isLoading,
			resolved,
		};
		if (isLoading) return buildLoadingOption(ctx);
		return {
			animation: false,
			tooltip: buildTooltipOption(ctx),
			series: buildPieSeries(ctx),
		};
	}, [
		live,
		data,
		config,
		nameKey,
		dataKey,
		pie,
		selectedSector,
		tooltipSlot,
		legendSlot,
		isLoading,
	]);
	const setupChart = useCallback(() => {
		const mount = mountRef.current;
		const container = containerRef.current;
		if (!mount || !container) return;
		const chart = echarts.init(mount, null, { renderer });
		echartsRef.current = chart;
		chart.getZr().on("mousemove", () => cancelActiveTooltip(chart));
		const resizeObserver = new ResizeObserver(() => {
			if (
				mount.clientWidth === chart.getWidth() &&
				mount.clientHeight === chart.getHeight()
			) {
				return;
			}
			chart.resize();
		});
		resizeObserver.observe(mount);
		const themeObserver = observeChartTheme(container, () => live.repush());
		chart.on("click", (params) => {
			const {
				isClickable,
				selectedSector: selected,
				selectSector: select,
			} = live.handlers;
			if (!isClickable) return;
			const p = params as {
				name?: string;
				seriesId?: string;
			};
			if (String(p.seriesId ?? "").startsWith("__")) return;
			const name = p.name;
			if (typeof name !== "string") return;
			select(selected === name ? null : name);
		});
		return () => {
			resizeObserver.disconnect();
			themeObserver.disconnect();
			cancelActiveTooltip(chart);
			chart.off();
			chart.getZr().off();
			chart.dispose();
			live.repush = () => {};
			echartsRef.current = null;
			live.hasRevealed = false;
		};
	}, [renderer]);
	const synchronizeChart = useCallback(() => {
		const chart = echartsRef.current;
		const container = containerRef.current;
		if (!chart || !container) return;
		live.resolved = resolveColors(container, config, sectorKeys);
		const activeSectorIndex = boundedIndex(
			sectorKeys.indexOf(activeSector ?? ""),
			data.length,
		);
		const visibleSectorIndex =
			activeSectorIndex !== null &&
			finiteValue(data[activeSectorIndex]?.[dataKey]) !== null
				? activeSectorIndex
				: null;
		const push = (withEntrance: boolean) => {
			const option = buildOption();
			const merged = chartOptions ? { ...option, ...chartOptions } : option;
			Object.assign(merged, {
				animation: withEntrance,
				animationDuration: REVEAL_DURATION,
				animationDurationUpdate: 0,
			});
			setChartOption(chart, merged);
			if (activeSector !== undefined)
				showActiveIndex(chart, isLoading ? null : visibleSectorIndex);
		};
		if (isLoading) live.hasRevealed = false;
		const shouldReveal = !live.hasRevealed && !isLoading;
		if (shouldReveal) live.hasRevealed = true;
		const revealEnabled = animation && shouldReveal && !shouldReduceMotion;
		push(revealEnabled);
		live.repush = () => {
			live.resolved = resolveColors(container, config, sectorKeys);
			push(false);
		};
	}, [
		live,
		buildOption,
		chartOptions,
		activeSector,
		data,
		dataKey,
		isLoading,
		animation,
		shouldReduceMotion,
		config,
		renderer,
		sectorKeys,
	]);
	const animatePrimary = useCallback(() => {
		const chart = echartsRef.current;
		if (
			!chart ||
			isLoading ||
			activeSector !== undefined ||
			!tooltipSlot.present ||
			boundedIndex(tooltipSlot.defaultIndex, data.length) === null
		)
			return;
		const raf = requestAnimationFrame(() => {
			chart.dispatchAction({
				type: "showTip",
				seriesIndex: 0,
				dataIndex: tooltipSlot.defaultIndex,
			});
		});
		return () => cancelAnimationFrame(raf);
	}, [
		isLoading,
		tooltipSlot.present,
		tooltipSlot.defaultIndex,
		renderer,
		activeSector,
		data.length,
	]);
	const animateLoading = useCallback(() => {
		const chart = echartsRef.current;
		if (!chart || !isLoading || shouldReduceMotion) return;
		const cornerRadius = pie?.cornerRadius ?? DEFAULT_CORNER_RADIUS;
		const paddingAngle = pie?.paddingAngle ?? DEFAULT_PADDING_ANGLE;
		let raf = 0;
		const start = performance.now();
		const tick = (now: number) => {
			const phase =
				((((now - start) / LOADING_ANIMATION_DURATION) % 1) + 1) % 1;
			const foreground = live.resolved?.tokens.foreground ?? FALLBACK_COLOR;
			const background = live.resolved?.tokens.background ?? FALLBACK_COLOR;
			const border = sectorBorder(paddingAngle, background);
			const sectors = Array.from({ length: LOADING_SECTORS }, (_, i) => {
				const pos = (i + 0.5) / LOADING_SECTORS;
				const itemStyle: PieItemStyle = {
					color: withAlpha(foreground, loadingSectorAlpha(pos, phase)),
					opacity: 1,
					borderRadius: cornerRadius,
				};
				if (border) {
					itemStyle.borderColor = border.borderColor;
					itemStyle.borderWidth = border.borderWidth;
				}
				return { value: 1, itemStyle };
			});
			chart.setOption(
				{ series: [{ id: "__loading", data: sectors }] },
				{ silent: true, lazyUpdate: true },
			);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [live, isLoading, pie, renderer, shouldReduceMotion]);
	const commitChart = useChartLifecycle(
		{
			prepare: () => {
				live.handlers = {
					isClickable: pie?.isClickable ?? false,
					selectedSector,
					selectSector,
				};
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
				? { bottom: 12 }
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
				{backgroundSlot.present && !isLoading && (
					<BackgroundLayer variant={backgroundSlot.variant} />
				)}
				<div ref={mountRef} className="relative h-full min-h-0 w-full" />
			</div>

			{legendSlot.present && !isLoading && (
				<LegendOverlay
					seriesKeys={sectorKeys}
					config={config}
					variant={legendSlot.variant}
					align={legendSlot.align}
					verticalAlign={legendSlot.verticalAlign}
					selectedKey={selectedSector}
					hoveredKey={null}
					isClickable={legendSlot.isClickable}
					onToggle={(key) => selectSector(selectedSector === key ? null : key)}
					style={legendStyle}
				/>
			)}
		</div>
	);
}
EChartsPieChart.Pie = Pie;
EChartsPieChart.Label = Label;
EChartsPieChart.Tooltip = Tooltip;
EChartsPieChart.Legend = Legend;
EChartsPieChart.Background = Background;
