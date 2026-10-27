"use client";

import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import {
	CHART_CONFIG,
	type ChartColor,
	chartThemeColors,
} from "../lib/chart-config";
import { cn } from "../lib/utils";
import { ChartSwatch } from "./chart-swatch";
import {
	type ChartConfig,
	EChartsAreaChart,
} from "./evilcharts/charts/echarts-area-chart";
import { EChartsBarChart } from "./evilcharts/charts/echarts-bar-chart";
import { EChartsPieChart } from "./evilcharts/charts/echarts-pie-chart";

type Datum = Record<string, number | string | null>;

type SeriesConfig = Record<string, { label: string; color: ChartColor }>;

type FormatValue = (value: number | string) => string;

type CartesianProps = {
	data: Datum[];
	config: SeriesConfig;
	xKey: string;
	series?: string[];
	className?: string;
	height?: number;
	showXAxis?: boolean;
	showLegend?: boolean;
	formatX?: (value: string) => string;
	formatValue?: FormatValue;
	stacked?: boolean;
	label?: string;
};

type DonutSlice = {
	key: string;
	label: string;
	value: number;
	color: ChartColor;
};

type SeriesEntry = { key: string; label: string; color: ChartColor };

const LABEL_KEY = "__label";
const DEFAULT_LABEL = "Chart";

function formatWith(formatValue: FormatValue | undefined, value: number) {
	return formatValue ? formatValue(value) : value.toLocaleString();
}

function cellValue(
	formatValue: FormatValue | undefined,
	value: Datum[string] | undefined,
) {
	return typeof value === "number" ? formatWith(formatValue, value) : "None";
}

function toChartConfig(entries: SeriesEntry[]): ChartConfig {
	return Object.fromEntries(
		entries.map(({ key, label, color }) => [
			key,
			{ label, colors: chartThemeColors(color) },
		]),
	);
}

function useSeries(config: SeriesConfig, series?: string[]) {
	const keyList = (series ?? Object.keys(config)).join("\u0000");
	return useMemo(() => {
		const entries = keyList.split("\u0000").flatMap((key) => {
			const entry = config[key];
			return entry ? [{ key, ...entry }] : [];
		});
		return { entries, chartConfig: toChartConfig(entries) };
	}, [config, keyList]);
}

function useLabelledRows(
	data: Datum[],
	xKey: string,
	formatX?: (value: string) => string,
) {
	return useMemo(
		() =>
			data.map((row) => ({
				...row,
				[LABEL_KEY]: formatX
					? formatX(String(row[xKey] ?? ""))
					: String(row[xKey] ?? ""),
			})),
		[data, xKey, formatX],
	);
}

function useKeyboardIndex(
	length: number,
	onActivate?: (index: number) => void,
) {
	const [keyIndex, setKeyIndex] = useState<number | null>(null);
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (length === 0) return;
		if ((event.key === "Enter" || event.key === " ") && onActivate) {
			event.preventDefault();
			if (keyIndex === null) return;
			onActivate(keyIndex);
			return;
		}
		const current = keyIndex ?? -1;
		const next =
			event.key === "ArrowRight" || event.key === "ArrowDown"
				? Math.min(length - 1, current + 1)
				: event.key === "ArrowLeft" || event.key === "ArrowUp"
					? Math.max(0, current < 0 ? length - 1 : current - 1)
					: event.key === "Home"
						? 0
						: event.key === "End"
							? length - 1
							: event.key === "Escape"
								? null
								: undefined;
		if (next === undefined) return;
		event.preventDefault();
		setKeyIndex(next);
	};

	return {
		keyIndex,
		activeIndex: hoverIndex ?? keyIndex,
		setHoverIndex,
		onKeyDown,
		onBlur: () => setKeyIndex(null),
	};
}

function useToggleSelection(onSelect?: (key: string) => void) {
	const [selected, setSelected] = useState<string | null>(null);
	if (!onSelect) return undefined;
	return (key: string | null) => {
		const clicked = key ?? selected;
		setSelected(key);
		if (clicked) onSelect(clicked);
	};
}

function ChartAnnouncement({ text }: { text: string }) {
	return (
		<span aria-live="polite" aria-atomic="true" className="sr-only">
			{text}
		</span>
	);
}

function sliceAnnouncement(
	slice: DonutSlice | null,
	formatValue: FormatValue | undefined,
) {
	return slice ? `${slice.label}: ${formatWith(formatValue, slice.value)}` : "";
}

function SeriesReadout({
	entries,
	row,
	heading,
	keyRow,
	formatValue,
	visible,
}: {
	entries: SeriesEntry[];
	row: Datum | null;
	heading: string | null;
	keyRow: (Datum & { [LABEL_KEY]: string }) | null;
	formatValue?: FormatValue;
	visible: boolean;
}) {
	const announcement = keyRow
		? [
				keyRow[LABEL_KEY],
				...entries.map(
					(entry) =>
						`${entry.label} ${cellValue(formatValue, keyRow[entry.key])}`,
				),
			].join(", ")
		: "";
	return (
		<>
			{visible ? (
				<div className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 px-5 text-13 text-muted-foreground md:px-6">
					{row && heading ? (
						<span className="font-medium text-foreground">{heading}</span>
					) : null}
					{entries.map((entry) => (
						<span key={entry.key} className="flex items-center gap-1.5">
							<ChartSwatch color={entry.color} />
							<span>{entry.label}</span>
							{row ? (
								<span className="text-foreground tabular-nums">
									{cellValue(formatValue, row[entry.key])}
								</span>
							) : null}
						</span>
					))}
				</div>
			) : null}
			<ChartAnnouncement text={announcement} />
		</>
	);
}

function SeriesTable({
	label,
	rows,
	entries,
	formatValue,
}: {
	label: string;
	rows: (Datum & { [LABEL_KEY]: string })[];
	entries: SeriesEntry[];
	formatValue?: FormatValue;
}) {
	return (
		<table className="sr-only">
			<caption>{label}</caption>
			<thead>
				<tr>
					<th scope="col">Period</th>
					{entries.map((entry) => (
						<th key={entry.key} scope="col">
							{entry.label}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row[LABEL_KEY]}>
						<th scope="row">{row[LABEL_KEY]}</th>
						{entries.map((entry) => (
							<td key={entry.key}>{cellValue(formatValue, row[entry.key])}</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

function SliceTable({
	label,
	data,
	formatValue,
}: {
	label: string;
	data: DonutSlice[];
	formatValue?: FormatValue;
}) {
	return (
		<table className="sr-only">
			<caption>{label}</caption>
			<tbody>
				{data.map((slice) => (
					<tr key={slice.key}>
						<th scope="row">{slice.label}</th>
						<td>{formatWith(formatValue, slice.value)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function ChartFrame({
	label,
	hint,
	height,
	keyboard,
	readout,
	table,
	className,
	children,
}: {
	label: string;
	hint: string;
	height: number;
	keyboard: ReturnType<typeof useKeyboardIndex>;
	readout: ReactNode;
	table: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("flex w-full min-w-0 flex-col gap-3", className)}>
			<div
				role="group"
				aria-label={`${label}. ${hint}`}
				tabIndex={0}
				onKeyDown={keyboard.onKeyDown}
				onBlur={keyboard.onBlur}
				className="relative rounded-md p-1 outline-none after:pointer-events-none after:absolute after:inset-1 after:rounded-sm focus-visible:after:shadow-focus [--focus-outline-offset:-2px]"
				style={{ height }}
			>
				<div aria-hidden className="h-full w-full">
					{children}
				</div>
			</div>
			{readout}
			{table}
		</div>
	);
}

function AreaTrend({
	data,
	config,
	xKey,
	series,
	className,
	height = CHART_CONFIG.height.area,
	showXAxis = true,
	showLegend = false,
	formatX,
	formatValue,
	stacked = false,
	label = DEFAULT_LABEL,
}: CartesianProps) {
	const { entries, chartConfig } = useSeries(config, series);
	const rows = useLabelledRows(data, xKey, formatX);
	const keyboard = useKeyboardIndex(rows.length);
	const active =
		keyboard.activeIndex === null ? null : (rows[keyboard.activeIndex] ?? null);
	const parts = useMemo(
		() => [
			<EChartsAreaChart.Grid key="grid" />,
			showXAxis ? <EChartsAreaChart.XAxis key="x" dataKey={LABEL_KEY} /> : null,
			<EChartsAreaChart.Tooltip key="tooltip" valueFormatter={formatValue} />,
			...entries.map(({ key }) => (
				<EChartsAreaChart.Area
					key={key}
					dataKey={key}
					variant="gradient"
					strokeVariant={CHART_CONFIG.area.stroke}
					strokeWidth={CHART_CONFIG.area.strokeWidth}
				/>
			)),
		],
		[entries, showXAxis, formatValue],
	);

	return (
		<ChartFrame
			label={label}
			hint="Use the arrow keys to read each period."
			height={height}
			keyboard={keyboard}
			className={className}
			readout={
				<SeriesReadout
					entries={entries}
					row={active}
					heading={active ? active[LABEL_KEY] : null}
					keyRow={
						keyboard.keyIndex === null
							? null
							: (rows[keyboard.keyIndex] ?? null)
					}
					formatValue={formatValue}
					visible={showLegend || keyboard.keyIndex !== null}
				/>
			}
			table={
				<SeriesTable
					label={label}
					rows={rows}
					entries={entries}
					formatValue={formatValue}
				/>
			}
		>
			<EChartsAreaChart
				data={rows}
				config={chartConfig}
				xDataKey={LABEL_KEY}
				className="h-full w-full"
				curveType={CHART_CONFIG.area.curve}
				stackType={stacked ? "stacked" : "default"}
				activeIndex={keyboard.keyIndex}
				onHoverIndexChange={keyboard.setHoverIndex}
			>
				{parts}
			</EChartsAreaChart>
		</ChartFrame>
	);
}

function BarTrend({
	data,
	config,
	xKey,
	series,
	className,
	height = CHART_CONFIG.height.bar,
	showXAxis = true,
	showLegend = false,
	formatX,
	formatValue,
	stacked = false,
	label = DEFAULT_LABEL,
}: CartesianProps) {
	const { entries, chartConfig } = useSeries(config, series);
	const rows = useLabelledRows(data, xKey, formatX);
	const keyboard = useKeyboardIndex(rows.length);
	const active =
		keyboard.activeIndex === null ? null : (rows[keyboard.activeIndex] ?? null);
	const parts = useMemo(
		() => [
			<EChartsBarChart.Grid key="grid" />,
			showXAxis ? <EChartsBarChart.XAxis key="x" dataKey={LABEL_KEY} /> : null,
			<EChartsBarChart.Tooltip key="tooltip" valueFormatter={formatValue} />,
			...entries.map(({ key }) => (
				<EChartsBarChart.Bar key={key} dataKey={key} variant="gradient" />
			)),
		],
		[entries, showXAxis, formatValue],
	);

	return (
		<ChartFrame
			label={label}
			hint="Use the arrow keys to read each period."
			height={height}
			keyboard={keyboard}
			className={className}
			readout={
				<SeriesReadout
					entries={entries}
					row={active}
					heading={active ? active[LABEL_KEY] : null}
					keyRow={
						keyboard.keyIndex === null
							? null
							: (rows[keyboard.keyIndex] ?? null)
					}
					formatValue={formatValue}
					visible={showLegend || keyboard.keyIndex !== null}
				/>
			}
			table={
				<SeriesTable
					label={label}
					rows={rows}
					entries={entries}
					formatValue={formatValue}
				/>
			}
		>
			<EChartsBarChart
				data={rows}
				config={chartConfig}
				xDataKey={LABEL_KEY}
				className="h-full w-full"
				barRadius={CHART_CONFIG.bar.radius}
				stackType={stacked ? "stacked" : "default"}
				activeIndex={keyboard.keyIndex}
			>
				{parts}
			</EChartsBarChart>
		</ChartFrame>
	);
}

function BarStat({
	data,
	className,
	height = CHART_CONFIG.height.bar,
	onBarClick,
	formatValue,
	label = DEFAULT_LABEL,
}: {
	data: DonutSlice[];
	className?: string;
	height?: number;
	onBarClick?: (key: string) => void;
	formatValue?: FormatValue;
	label?: string;
}) {
	const chartConfig = useMemo(() => toChartConfig(data), [data]);
	const rows = useMemo(
		() =>
			data.map((slice) => ({
				[LABEL_KEY]: slice.label,
				[slice.key]: slice.value,
			})),
		[data],
	);
	const keyboard = useKeyboardIndex(
		data.length,
		onBarClick
			? (index) => {
					const slice = data[index];
					if (slice) onBarClick(slice.key);
				}
			: undefined,
	);
	const onSelectionChange = useToggleSelection(onBarClick);
	const clickable = Boolean(onBarClick);
	const parts = useMemo(
		() => [
			<EChartsBarChart.Grid key="grid" />,
			<EChartsBarChart.XAxis key="x" dataKey={LABEL_KEY} />,
			<EChartsBarChart.Tooltip key="tooltip" valueFormatter={formatValue} />,
			...data.map((slice) => (
				<EChartsBarChart.Bar
					key={slice.key}
					dataKey={slice.key}
					variant="gradient"
					isClickable={clickable}
				/>
			)),
		],
		[data, clickable, formatValue],
	);
	const active =
		keyboard.activeIndex === null ? null : (data[keyboard.activeIndex] ?? null);
	const focused =
		keyboard.keyIndex === null ? null : (data[keyboard.keyIndex] ?? null);

	return (
		<ChartFrame
			label={label}
			hint={
				onBarClick
					? "Use the arrow keys to read each bar and Enter to open it."
					: "Use the arrow keys to read each bar."
			}
			height={height}
			keyboard={keyboard}
			className={className}
			readout={
				<>
					<ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 text-13 text-muted-foreground md:px-6">
						{data.map((slice) => (
							<li
								key={slice.key}
								className={cn(
									"flex items-center gap-1.5 transition-opacity",
									active && active.key !== slice.key && "opacity-40",
								)}
							>
								<ChartSwatch color={slice.color} />
								<span>{slice.label}</span>
								<span className="text-foreground tabular-nums">
									{formatWith(formatValue, slice.value)}
								</span>
							</li>
						))}
					</ul>
					<ChartAnnouncement text={sliceAnnouncement(focused, formatValue)} />
				</>
			}
			table={<SliceTable label={label} data={data} formatValue={formatValue} />}
		>
			<EChartsBarChart
				data={rows}
				config={chartConfig}
				xDataKey={LABEL_KEY}
				className="h-full w-full"
				barRadius={CHART_CONFIG.bar.radius}
				stackType="stacked"
				activeIndex={keyboard.keyIndex}
				onSelectionChange={onSelectionChange}
			>
				{parts}
			</EChartsBarChart>
		</ChartFrame>
	);
}

function DonutStat({
	data,
	className,
	height = CHART_CONFIG.height.donut,
	centerValue,
	centerLabel,
	onSliceClick,
	formatValue,
	label = DEFAULT_LABEL,
}: {
	data: DonutSlice[];
	className?: string;
	height?: number;
	centerValue?: ReactNode;
	centerLabel?: ReactNode;
	onSliceClick?: (key: string) => void;
	formatValue?: FormatValue;
	label?: string;
}) {
	const chartConfig = useMemo(() => toChartConfig(data), [data]);
	const chartRows = useMemo(
		() => data.map(({ key, label, value }) => ({ key, label, value })),
		[data],
	);
	const keyboard = useKeyboardIndex(
		data.length,
		onSliceClick
			? (index) => {
					const slice = data[index];
					if (slice) onSliceClick(slice.key);
				}
			: undefined,
	);
	const onToggle = useToggleSelection(onSliceClick);
	const clickable = Boolean(onSliceClick);
	const parts = useMemo(
		() => [
			<EChartsPieChart.Tooltip
				key="tooltip"
				position="bottom"
				valueFormatter={formatValue}
			/>,
			<EChartsPieChart.Pie
				key="pie"
				variant="gradient"
				innerRadius={CHART_CONFIG.donut.innerRadius}
				outerRadius={CHART_CONFIG.donut.outerRadius}
				cornerRadius={CHART_CONFIG.donut.cornerRadius}
				paddingAngle={CHART_CONFIG.donut.paddingAngle}
				isClickable={clickable}
			/>,
		],
		[clickable, formatValue],
	);
	const focused =
		keyboard.keyIndex === null ? null : (data[keyboard.keyIndex] ?? null);
	const hasCenter = centerValue != null || centerLabel != null;

	return (
		<div className={cn("flex w-full min-w-0 flex-col items-center", className)}>
			<div
				role="group"
				aria-label={`${label}. ${
					onSliceClick
						? "Use the arrow keys to read each slice and Enter to open it."
						: "Use the arrow keys to read each slice."
				}`}
				tabIndex={0}
				onKeyDown={keyboard.onKeyDown}
				onBlur={keyboard.onBlur}
				className="relative aspect-square max-w-full rounded-full outline-none focus-visible:shadow-focus"
				style={{ height }}
			>
				<div aria-hidden className="h-full w-full">
					<EChartsPieChart
						data={chartRows}
						config={chartConfig}
						dataKey="value"
						nameKey="key"
						className="h-full w-full"
						activeSector={focused?.key ?? null}
						onSelectionChange={
							onToggle
								? (selection) => onToggle(selection?.dataKey ?? null)
								: undefined
						}
					>
						{parts}
					</EChartsPieChart>
				</div>
				{hasCenter ? (
					<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
						{centerValue != null ? (
							<span className="font-medium text-2xl text-foreground tabular-nums">
								{centerValue}
							</span>
						) : null}
						{centerLabel != null ? (
							<span className="text-13 text-muted-foreground">
								{centerLabel}
							</span>
						) : null}
					</div>
				) : null}
				<ChartAnnouncement text={sliceAnnouncement(focused, formatValue)} />
			</div>
			<SliceTable label={label} data={data} formatValue={formatValue} />
		</div>
	);
}

export type { Datum, DonutSlice, SeriesConfig };
export { AreaTrend, BarStat, BarTrend, DonutStat };
