import type {
	BarSeriesOption,
	LineSeriesOption,
	PieSeriesOption,
} from "echarts/charts";
import type {
	DataZoomComponentOption,
	GridComponentOption,
	TooltipComponentOption,
} from "echarts/components";
import type { ComposeOption, EChartsType } from "echarts/core";

type EngineOption = ComposeOption<
	| BarSeriesOption
	| LineSeriesOption
	| PieSeriesOption
	| DataZoomComponentOption
	| GridComponentOption
	| TooltipComponentOption
>;

function keyedComponents<T extends { id?: string | number }>(
	value: T | T[] | undefined,
	prefix: string,
): T[] {
	const components = Array.isArray(value) ? value : value ? [value] : [];
	return components.map((component, index) => ({
		...component,
		id: component.id ?? `__${prefix}-${index}`,
	}));
}

export function setChartOption(chart: EChartsType, option: EngineOption) {
	const cartesian =
		option.grid !== undefined ||
		option.xAxis !== undefined ||
		option.yAxis !== undefined;
	const components = cartesian
		? {
				grid: keyedComponents(option.grid, "grid"),
				xAxis: keyedComponents(option.xAxis, "x-axis"),
				yAxis: keyedComponents(option.yAxis, "y-axis"),
				dataZoom: keyedComponents(option.dataZoom, "zoom"),
			}
		: {};
	chart.setOption(
		{
			...option,
			...components,
			series: keyedComponents(option.series, "series"),
		},
		{
			replaceMerge: cartesian
				? ["series", "grid", "xAxis", "yAxis", "dataZoom"]
				: ["series"],
		},
	);
}

export function seriesIndexForId(chart: EChartsType, id: string) {
	const option: EngineOption = chart.getOption();
	const series = Array.isArray(option.series) ? option.series : [option.series];
	return series.findIndex((component) => component?.id === id);
}
