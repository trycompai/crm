import { afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act, type ReactNode } from "react";

if (process.env.CRM_DASHBOARD_CHART_TEST_CHILD !== "1") {
	test("dashboard chart wrappers run in an isolated DOM", () => {
		const result = Bun.spawnSync(["bun", "test", import.meta.path], {
			env: { ...process.env, CRM_DASHBOARD_CHART_TEST_CHILD: "1" },
			stdout: "pipe",
			stderr: "pipe",
		});
		const output = new TextDecoder().decode(result.stderr);
		expect(output).not.toContain("(fail)");
		expect(output).toContain(" 0 fail");
		expect(result.exitCode).toBe(0);
	});
} else {
	const browser = new Window({ url: "http://localhost" });
	Object.assign(globalThis, {
		window: browser,
		document: browser.document,
		navigator: browser.navigator,
		HTMLElement: browser.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: true,
	});

	type EngineProps = {
		activeIndex?: number | null;
		activeSector?: string | null;
		onHoverIndexChange?: (index: number | null) => void;
		onSelectionChange?: unknown;
		children?: ReactNode;
	};
	type EngineState = { last: EngineProps | null };
	const engine: EngineState = { last: null };
	const part = () => null;
	function stubChart(name: string, parts: string[]) {
		const Chart = (props: EngineProps) => {
			engine.last = props;
			return <div data-engine={name} />;
		};
		return Object.assign(
			Chart,
			Object.fromEntries(parts.map((key) => [key, part])),
		);
	}
	mock.module("../src/components/evilcharts/charts/echarts-area-chart", () => ({
		EChartsAreaChart: stubChart("area", ["Grid", "XAxis", "Tooltip", "Area"]),
	}));
	mock.module("../src/components/evilcharts/charts/echarts-bar-chart", () => ({
		EChartsBarChart: stubChart("bar", ["Grid", "XAxis", "Tooltip", "Bar"]),
	}));
	mock.module("../src/components/evilcharts/charts/echarts-pie-chart", () => ({
		EChartsPieChart: stubChart("pie", ["Tooltip", "Pie"]),
	}));

	const { createRoot } = await import("react-dom/client");
	const { AreaTrend, BarStat, BarTrend, DonutStat } = await import(
		"../src/components/dashboard-chart"
	);
	const { ChartSwatch } = await import("../src/components/chart-swatch");
	const { ValueMeter } = await import("../src/components/value-meter");
	const { CHART_CONFIG } = await import("../src/lib/chart-config");

	const roots: ReturnType<typeof createRoot>[] = [];
	afterEach(() => {
		for (const root of roots.splice(0)) act(() => root.unmount());
		document.body.innerHTML = "";
		engine.last = null;
	});

	function render(node: ReactNode) {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container as unknown as Element);
		roots.push(root);
		act(() => root.render(node));
		return container;
	}

	function press(target: Element, key: string) {
		const event = new browser.KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
		});
		act(() => {
			target.dispatchEvent(event as unknown as Event);
		});
		return event;
	}

	function liveRegions(container: Element) {
		return [...container.querySelectorAll("[aria-live]")];
	}

	function onlyLiveRegion(container: Element) {
		const regions = liveRegions(container);
		expect(regions).toHaveLength(1);
		const region = regions[0] as Element;
		expect(region.getAttribute("aria-live")).toBe("polite");
		expect(region.getAttribute("aria-atomic")).toBe("true");
		expect(region.className).toContain("sr-only");
		return region;
	}

	function group(container: Element) {
		const groups = [...container.querySelectorAll('[role="group"]')];
		expect(groups).toHaveLength(1);
		expect(container.querySelectorAll("[tabindex]")).toHaveLength(1);
		const element = groups[0] as Element;
		expect(element.getAttribute("tabindex")).toBe("0");
		return element;
	}

	const money = (value: number | string) => `$${Number(value).toFixed(0)}`;
	const trend = [
		{ month: "2026-05", won: 0, created: 74000 },
		{ month: "2026-06", won: 1200, created: null },
	];
	const trendConfig = {
		won: { label: "Closed won", color: CHART_CONFIG.trend.won },
		created: { label: "New pipeline", color: CHART_CONFIG.trend.created },
	};
	const slices = [
		{
			key: "demo",
			label: "Demo booked",
			value: 75000,
			color: CHART_CONFIG.stages[0],
		},
		{
			key: "decision",
			label: "Decision maker in",
			value: 76000,
			color: CHART_CONFIG.stages[1],
		},
	];

	for (const [name, Chart] of [
		["AreaTrend", AreaTrend],
		["BarTrend", BarTrend],
	] as const) {
		test(`${name} announces only the keyboard period and clears on Escape`, () => {
			const container = render(
				<Chart
					data={trend}
					config={trendConfig}
					xKey="month"
					showLegend
					formatX={(value) => (value.endsWith("05") ? "May" : "Jun")}
					formatValue={money}
					label="Trend"
				/>,
			);
			const region = onlyLiveRegion(container);
			const chart = group(container);
			expect(region.textContent).toBe("");

			press(chart, "ArrowRight");
			expect(region.textContent).toBe(
				"May, Closed won $0, New pipeline $74000",
			);
			expect(engine.last?.activeIndex).toBe(0);
			press(chart, "ArrowRight");
			expect(region.textContent).toBe(
				"Jun, Closed won $1200, New pipeline None",
			);
			expect(onlyLiveRegion(container)).toBe(region);

			press(chart, "Escape");
			expect(region.textContent).toBe("");
			expect(engine.last?.activeIndex).toBeNull();
		});
	}

	test("AreaTrend pointer hover updates the visible readout, not the live region", () => {
		const container = render(
			<AreaTrend
				data={trend}
				config={trendConfig}
				xKey="month"
				showLegend
				formatX={(value) => (value.endsWith("05") ? "May" : "Jun")}
				formatValue={money}
			/>,
		);
		const region = onlyLiveRegion(container);
		act(() => engine.last?.onHoverIndexChange?.(1));
		expect(container.textContent).toContain("Jun");
		expect(region.textContent).toBe("");
	});

	test("BarStat legend is static and a stable region announces the keyboard bar", () => {
		const opened: string[] = [];
		const container = render(
			<BarStat
				data={slices}
				formatValue={money}
				onBarClick={(key) => opened.push(key)}
				label="Stages"
			/>,
		);
		const legend = container.querySelector("ul");
		expect(legend?.hasAttribute("aria-live")).toBe(false);
		const region = onlyLiveRegion(container);
		const chart = group(container);
		expect(region.textContent).toBe("");

		press(chart, "Enter");
		expect(opened).toEqual([]);
		press(chart, "End");
		expect(region.textContent).toBe("Decision maker in: $76000");
		expect(engine.last?.activeIndex).toBe(1);
		press(chart, "Home");
		expect(region.textContent).toBe("Demo booked: $75000");
		press(chart, "Enter");
		expect(opened).toEqual(["demo"]);
		expect(onlyLiveRegion(container)).toBe(region);

		press(chart, "Escape");
		expect(region.textContent).toBe("");
		expect(engine.last?.activeIndex).toBeNull();
		expect(legend?.textContent).toContain("Demo booked$75000");
	});

	test("DonutStat announces the keyboard slice atomically and clears on Escape", () => {
		const opened: string[] = [];
		const container = render(
			<DonutStat
				data={slices}
				formatValue={money}
				onSliceClick={(key) => opened.push(key)}
				centerValue="$151K"
				label="Pipeline"
			/>,
		);
		const region = onlyLiveRegion(container);
		const chart = group(container);
		expect(region.textContent).toBe("");
		press(chart, "ArrowLeft");
		expect(region.textContent).toBe("Decision maker in: $76000");
		expect(engine.last?.activeSector).toBe("decision");
		press(chart, " ");
		expect(opened).toEqual(["decision"]);
		press(chart, "Escape");
		expect(region.textContent).toBe("");
		expect(engine.last?.activeSector).toBeNull();
	});

	test("Space does not scroll or activate an actionable chart before a keyboard selection", () => {
		const opened: string[] = [];
		const container = render(
			<>
				<BarStat data={slices} onBarClick={(key) => opened.push(key)} />
				<DonutStat data={slices} onSliceClick={(key) => opened.push(key)} />
			</>,
		);
		const charts = [...container.querySelectorAll('[role="group"]')];
		expect(charts).toHaveLength(2);
		for (const chart of charts) {
			expect(press(chart, " ").defaultPrevented).toBe(true);
		}
		expect(opened).toEqual([]);
	});

	test("Readout swatches pair each label with a forced-colors outline", () => {
		const container = render(
			<BarStat data={slices} formatValue={money} label="Stages" />,
		);
		const swatches = [
			...container.querySelectorAll('[data-slot="chart-swatch"]'),
		];
		expect(swatches).toHaveLength(2);
		for (const [index, swatch] of swatches.entries()) {
			expect(swatch.getAttribute("aria-hidden")).toBe("true");
			for (const token of [
				"size-2",
				"forced-colors:forced-color-adjust-none",
				"forced-colors:outline-solid",
				"forced-colors:outline-1",
				"forced-colors:outline-[CanvasText]",
			]) {
				expect(swatch.classList.contains(token)).toBe(true);
			}
			expect(swatch.nextElementSibling?.textContent).toBe(slices[index]?.label);
		}
	});

	test("ChartSwatch sm variant matches the stage legend square", () => {
		const container = render(
			<ChartSwatch color={CHART_CONFIG.stages[2]} size="sm" />,
		);
		const swatch = container.querySelector('[data-slot="chart-swatch"]');
		expect(swatch?.classList.contains("size-1.5")).toBe(true);
		expect(swatch?.classList.contains("rounded-[2px]")).toBe(false);
		expect(
			swatch?.classList.contains("forced-colors:forced-color-adjust-none"),
		).toBe(true);
	});

	test("ValueMeter clamps the share and keeps a forced-colors track and fill", () => {
		const container = render(
			<>
				<ValueMeter share={-5} color={CHART_CONFIG.stages[0]} />
				<ValueMeter share={42.4} color={CHART_CONFIG.stages[1]} />
				<ValueMeter share={180} color={CHART_CONFIG.stages[2]} />
			</>,
		);
		const fills = [
			...container.querySelectorAll('[data-slot="value-meter-fill"]'),
		];
		expect(
			fills.map((fill) =>
				(fill as unknown as HTMLElement).style.getPropertyValue("--share"),
			),
		).toEqual(["0%", "42%", "100%"]);
		const track = container.querySelector('[data-slot="value-meter"]');
		for (const token of [
			"h-1.5",
			"bg-muted",
			"forced-colors:outline-1",
			"forced-colors:outline-[CanvasText]",
		]) {
			expect(track?.classList.contains(token)).toBe(true);
		}
		expect(
			fills[0]?.classList.contains("forced-colors:forced-color-adjust-none"),
		).toBe(true);
		expect(
			track?.classList.contains("forced-colors:forced-color-adjust-none"),
		).toBe(false);
	});
}
