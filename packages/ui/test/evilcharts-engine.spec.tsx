import { afterEach, expect, mock, test } from "bun:test";
import type { TooltipComponentPositionCallback } from "echarts";
import { Window } from "happy-dom";
import {
	act,
	type ReactNode,
	StrictMode,
	Suspense,
	startTransition,
	useCallback,
	useRef,
	useState,
} from "react";

if (process.env.CRM_EVILCHARTS_TEST_CHILD !== "1") {
	test("EvilCharts engine runs in an isolated DOM", () => {
		const result = Bun.spawnSync(["bun", "test", import.meta.path], {
			env: { ...process.env, CRM_EVILCHARTS_TEST_CHILD: "1" },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(new TextDecoder().decode(result.stderr)).not.toContain("(fail)");
		expect(result.exitCode).toBe(0);
	});
} else {
	const browser = new Window({ url: "http://localhost" });
	let width = 500;
	let height = 300;
	let reducedMotion = false;
	let nextFrame = 0;
	const frames = new Map<number, FrameRequestCallback>();
	const mediaSubscribers = new Set<() => void>();
	browser.matchMedia = () => ({
		matches: reducedMotion,
		addEventListener: (_name: string, callback: () => void) => {
			mediaSubscribers.add(callback);
		},
		removeEventListener: (_name: string, callback: () => void) => {
			mediaSubscribers.delete(callback);
		},
	});
	const resizeObservers = new Set<TestResizeObserver>();
	class TestResizeObserver {
		constructor(readonly callback: () => void) {}
		observe() {
			resizeObservers.add(this);
		}
		disconnect() {
			resizeObservers.delete(this);
		}
	}
	Object.assign(globalThis, {
		window: browser,
		document: browser.document,
		navigator: browser.navigator,
		HTMLElement: browser.HTMLElement,
		MutationObserver: browser.MutationObserver,
		ResizeObserver: TestResizeObserver,
		getComputedStyle: browser.getComputedStyle.bind(browser),
		IS_REACT_ACT_ENVIRONMENT: true,
		requestAnimationFrame: (callback: FrameRequestCallback) => {
			const id = ++nextFrame;
			frames.set(id, callback);
			return id;
		},
		cancelAnimationFrame: (id: number) => {
			frames.delete(id);
		},
	});
	Object.defineProperties(browser.HTMLElement.prototype, {
		clientWidth: { configurable: true, get: () => width },
		clientHeight: { configurable: true, get: () => height },
	});
	Object.defineProperty(browser.HTMLCanvasElement.prototype, "getContext", {
		configurable: true,
		value: () => null,
	});
	mock.module("motion/react", () => ({
		useReducedMotion: () => reducedMotion,
	}));
	const core = await import("echarts/core");
	const nativeInit = core.init;
	type EventData = {
		seriesId?: string;
		seriesIndex?: number;
		name?: string;
		offsetX?: number;
		offsetY?: number;
	};
	type Action = {
		type: string;
		dataIndex?: number;
		seriesId?: string;
		seriesIndex?: number;
	};
	type Series = {
		id?: string;
		type?: string;
		stack?: string;
		data?: (
			| number
			| string
			| null
			| {
					name?: string;
					value: number | string;
					itemStyle?: { opacity?: number };
			  }
		)[];
		lineStyle?: { color?: string; width?: number; opacity?: number };
		itemStyle?: { opacity?: number };
	};
	type PixelFinder = {
		gridIndex?: number;
		xAxisIndex?: number;
		yAxisIndex?: number;
	};
	type TooltipValue = {
		seriesId?: string;
		value?: number | string | null;
		axisValue?: string;
		name?: string;
	};
	type Option = {
		animation?: boolean;
		backgroundColor?: string;
		series?: Series[];
		tooltip?: {
			show?: boolean;
			trigger?: string;
			formatter?: (params: TooltipValue | TooltipValue[]) => string;
		};
		dataZoom?: { start: number; end: number }[];
	};
	class Events {
		listeners = new Map<string, Set<(event: EventData) => void>>();
		on(name: string, callback: (event: EventData) => void) {
			const callbacks = this.listeners.get(name) ?? new Set();
			callbacks.add(callback);
			this.listeners.set(name, callbacks);
		}
		off(name?: string, callback?: (event: EventData) => void) {
			if (!name) this.listeners.clear();
			else if (callback) this.listeners.get(name)?.delete(callback);
			else this.listeners.delete(name);
		}
		emit(name: string, event: EventData = {}) {
			for (const callback of this.listeners.get(name) ?? []) callback(event);
		}
		add() {}
		remove() {}
	}
	class TestChart extends Events {
		zr = new Events();
		options: Option[] = [];
		updates: { notMerge?: boolean; replaceMerge?: string[] }[] = [];
		actions: Action[] = [];
		silent: boolean[] = [];
		disposed = false;
		resizes = 0;
		width = width;
		height = height;
		constructor(readonly renderer: string) {
			super();
		}
		setOption(
			option: Option,
			update: { notMerge?: boolean; replaceMerge?: string[] } = {},
		) {
			if (this.disposed) throw new Error("Chart update follows disposal.");
			this.options.push(option);
			this.updates.push(update);
		}
		getOption() {
			return this.options.at(-1) ?? {};
		}
		dispatchAction(action: Action, options?: { silent?: boolean }) {
			if (this.disposed) throw new Error("Chart action follows disposal.");
			this.actions.push(action);
			this.silent.push(options?.silent ?? false);
		}
		getWidth() {
			return this.width;
		}
		getHeight() {
			return this.height;
		}
		resize() {
			this.width = width;
			this.height = height;
			this.resizes += 1;
		}
		getZr() {
			return this.zr;
		}
		containPixel(_finder: PixelFinder, point: number[]) {
			return (point[0] ?? -1) >= 0 && (point[1] ?? -1) >= 0;
		}
		convertFromPixel(_finder: PixelFinder, point: number[]) {
			return point;
		}
		convertToPixel(_finder: PixelFinder, point: number | number[]) {
			return Array.isArray(point) ? point : point * 10;
		}
		dispose() {
			this.disposed = true;
		}
		isDisposed() {
			return this.disposed;
		}
	}
	const charts: TestChart[] = [];
	let nativeFixtures = false;
	const nativeInstances = new Set<ReturnType<typeof nativeInit>>();
	mock.module("echarts/core", () => ({
		...core,
		init: (
			_element: HTMLElement,
			_theme: null,
			options: { renderer: string },
		) => {
			if (nativeFixtures) {
				const instance = nativeInit(_element, null, {
					...options,
					width: 500,
					height: 300,
				});
				nativeInstances.add(instance);
				return instance;
			}
			const chart = new TestChart(options.renderer);
			charts.push(chart);
			return chart;
		},
	}));
	const { createRoot } = await import("react-dom/client");
	const { EChartsAreaChart: Area } = await import(
		"../src/components/evilcharts/charts/echarts-area-chart"
	);
	const { EChartsBarChart: Bar } = await import(
		"../src/components/evilcharts/charts/echarts-bar-chart"
	);
	const { EChartsPieChart: Pie } = await import(
		"../src/components/evilcharts/charts/echarts-pie-chart"
	);
	const { finiteSum, finiteValue, buildChartCss, normalizeColor } =
		await import("../src/components/evilcharts/ui/echarts-chart");
	const { tooltipRow, tooltipShell, resolveTooltipPosition } = await import(
		"../src/components/evilcharts/ui/echarts-tooltip"
	);
	const { setChartOption } = await import(
		"../src/components/evilcharts/ui/echarts-options"
	);
	const { showActiveIndex, useChartLifecycle } = await import(
		"../src/components/evilcharts/ui/echarts-lifecycle"
	);

	const config = {
		amount: {
			label: "Amount",
			colors: { light: ["#123456"], dark: ["#abcdef"] },
		},
	};
	const roots: ReturnType<typeof createRoot>[] = [];
	function mount(children: ReactNode) {
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);
		roots.push(root);
		act(() => root.render(children));
		return { root, container };
	}
	function chart() {
		const last = charts.at(-1);
		if (!last) throw new Error("Chart is missing.");
		return last;
	}
	function fullOption() {
		const option = chart().options.findLast((option) =>
			option.series?.some((series) => series.type),
		);
		if (!option) throw new Error("Full chart option is missing.");
		return option;
	}
	function values(id: string) {
		return fullOption().series?.find((series) => series.id === id)?.data;
	}
	function flushFrames() {
		const callbacks = [...frames.values()];
		frames.clear();
		act(() => {
			callbacks.forEach((callback) => {
				callback(performance.now() + 100);
			});
		});
	}
	afterEach(() => {
		act(() => {
			roots.splice(0).forEach((root) => {
				root.unmount();
			});
		});
		expect(resizeObservers.size).toBe(0);
		expect(frames.size).toBe(0);
		expect(mediaSubscribers.size).toBe(0);
		for (const chart of charts) {
			expect(chart.disposed).toBe(true);
			expect(chart.listeners.size).toBe(0);
			expect(chart.zr.listeners.size).toBe(0);
		}
		nativeInstances.forEach((instance) => {
			expect(instance.isDisposed()).toBe(true);
		});
		nativeInstances.clear();
		nativeFixtures = false;
		charts.length = 0;
		document.body.replaceChildren();
		document.documentElement.className = "";
		reducedMotion = false;
		width = 500;
		height = 300;
	});

	test("area preserves missing values, finite numbers, and real zero", () => {
		mount(
			<Area
				data={[
					{ day: "a", amount: 0 },
					{ day: "b", amount: null },
					{ day: "c", amount: Infinity },
					{ day: "d", amount: Number.NaN },
					{ day: "e", amount: 125 },
				]}
				config={config}
				xDataKey="day"
			>
				<Area.Area dataKey="amount" />
				<Area.Tooltip
					valueFormatter={(value) => `$${(value / 100).toFixed(2)}`}
				/>
			</Area>,
		);
		expect(values("amount")).toEqual([0, null, null, null, 125]);
		const formatter = fullOption().tooltip?.formatter;
		expect(
			formatter?.([{ seriesId: "amount", value: 125, axisValue: "a" }]),
		).toContain("$1.25");
		expect(
			formatter?.([{ seriesId: "amount", value: null, axisValue: "a" }]),
		).not.toContain("Amount");
		expect(chart().renderer).toBe("canvas");
	});

	test("committed props update options without replacing the chart or repeating entrance", () => {
		const view = (amount: number, formatter: (value: number) => string) => (
			<Area
				data={[{ day: "a", amount }]}
				config={config}
				chartOptions={{ backgroundColor: "transparent" }}
			>
				<Area.Area dataKey="amount" />
				<Area.Tooltip valueFormatter={formatter} />
			</Area>
		);
		const { root } = mount(view(100, () => "first"));
		expect(fullOption().animation).toBe(true);
		act(() => root.render(view(200, () => "second")));
		expect(charts.length).toBe(1);
		expect(values("amount")).toEqual([200]);
		expect(fullOption().animation).toBe(false);
		expect(fullOption().backgroundColor).toBe("transparent");
		expect(
			fullOption().tooltip?.formatter?.([{ seriesId: "amount", value: 200 }]),
		).toContain("second");
	});

	test("renderer changes dispose callbacks and StrictMode preserves entrance on the surviving chart", () => {
		const view = (renderer: "canvas" | "svg") => (
			<StrictMode>
				<Bar
					data={[{ day: "a", amount: 2 }]}
					config={config}
					renderer={renderer}
				>
					<Bar.Bar dataKey="amount" isClickable />
					<Bar.Tooltip />
				</Bar>
			</StrictMode>
		);
		const { root } = mount(view("canvas"));
		expect(charts.length).toBe(2);
		expect(charts[0]?.disposed).toBe(true);
		expect(fullOption().animation).toBe(true);
		const previous = chart();
		act(() => root.render(view("svg")));
		expect(previous.disposed).toBe(true);
		expect(previous.listeners.size).toBe(0);
		expect(previous.zr.listeners.size).toBe(0);
		expect(chart().renderer).toBe("svg");
		expect(resizeObservers.size).toBe(1);
	});

	test("resize and theme changes use current committed options", async () => {
		const view = (amount: number) => (
			<Area data={[{ day: "a", amount }]} config={config}>
				<Area.Area dataKey="amount" />
			</Area>
		);
		const { root } = mount(view(1));
		act(() => root.render(view(7)));
		width = 650;
		height = 350;
		act(() => {
			resizeObservers.forEach((observer) => {
				observer.callback();
			});
		});
		expect(chart().resizes).toBe(1);
		expect(values("amount")).toEqual([7]);
		const before = chart().options.length;
		await act(async () => {
			document.documentElement.className = "dark";
			await browser.happyDOM.waitUntilComplete();
		});
		expect(chart().options.length).toBeGreaterThan(before);
		expect(values("amount")).toEqual([7]);
		expect(
			fullOption().series?.find((series) => series.id === "amount")?.lineStyle
				?.color,
		).toBe("#abcdef");
	});

	test("controlled active indices reject invalid values and clear without selection callbacks", () => {
		const selections: (string | null)[] = [];
		const view = (activeIndex: number | null) => (
			<Bar
				data={[
					{ day: "a", amount: 0 },
					{ day: "b", amount: 8 },
				]}
				config={config}
				activeIndex={activeIndex}
				onSelectionChange={(key) => selections.push(key)}
			>
				<Bar.Bar dataKey="amount" isClickable />
				<Bar.Tooltip />
			</Bar>
		);
		const { root } = mount(view(1));
		expect(chart().actions.at(-1)).toMatchObject({
			type: "showTip",
			dataIndex: 1,
		});
		for (const index of [null, -1, 2, 0.5, Infinity]) {
			act(() => root.render(view(index)));
			expect(chart().actions.at(-1)?.type).toBe("hideTip");
		}
		expect(chart().silent.every(Boolean)).toBe(true);
		expect(selections).toEqual([]);
	});

	test("pointer hover survives first category render and restores keyboard focus on leave", () => {
		const hovered: (number | null)[] = [];
		function Interactive() {
			const [, setHovered] = useState<number | null>(null);
			return (
				<Area
					data={[
						{ day: "a", amount: 5 },
						{ day: "b", amount: 8 },
					]}
					config={config}
					activeIndex={1}
					onHoverIndexChange={(index) => {
						hovered.push(index);
						setHovered(index);
					}}
				>
					<Area.Area dataKey="amount" />
					<Area.Tooltip />
				</Area>
			);
		}
		mount(<Interactive />);
		act(() => chart().zr.emit("mousemove", { offsetX: 0, offsetY: 5 }));
		expect(hovered).toEqual([0]);
		expect(chart().actions.at(-1)).toMatchObject({
			type: "showTip",
			dataIndex: 0,
		});
		expect(fullOption().animation).toBe(false);
		expect(chart().updates.at(-1)?.notMerge).not.toBe(true);
		expect(chart().updates.at(-1)?.replaceMerge).toContain("series");
		act(() => chart().zr.emit("mousemove", { offsetX: 0, offsetY: 5 }));
		expect(hovered).toEqual([0]);
		act(() => chart().zr.emit("globalout"));
		expect(hovered).toEqual([0, null]);
		expect(chart().actions.at(-1)).toMatchObject({
			type: "showTip",
			dataIndex: 1,
		});
	});

	test("bar selection uses the current callback once under StrictMode", () => {
		const first: (string | null)[] = [];
		const current: (string | null)[] = [];
		const view = (select: (key: string | null) => void) => (
			<StrictMode>
				<Bar
					data={[{ day: "a", amount: 5 }]}
					config={config}
					onSelectionChange={select}
				>
					<Bar.Bar dataKey="amount" isClickable />
				</Bar>
			</StrictMode>
		);
		const { root } = mount(view((key) => first.push(key)));
		act(() => root.render(view((key) => current.push(key))));
		act(() => chart().emit("click", { seriesId: "amount" }));
		act(() => chart().emit("click", { seriesId: "amount" }));
		expect(first).toEqual([]);
		expect(current).toEqual(["amount", null]);
	});

	test("bar and pie preserve missing values and pie active sectors stay bounded", () => {
		mount(
			<Bar
				data={[
					{ day: "a", amount: 0 },
					{ day: "b", amount: null },
					{ day: "c", amount: Infinity },
				]}
				config={config}
			>
				<Bar.Bar dataKey="amount" />
			</Bar>,
		);
		expect(values("amount")).toEqual([0, null, null]);
		const view = (activeSector: string | null) => (
			<Pie
				data={[
					{ name: "amount", value: 125 },
					{ name: "missing", value: null },
					{ name: "zero", value: 0 },
				]}
				config={config}
				dataKey="value"
				nameKey="name"
				activeSector={activeSector}
			>
				<Pie.Pie />
				<Pie.Tooltip
					valueFormatter={(value) => `$${(value / 100).toFixed(2)}`}
				/>
			</Pie>
		);
		const { root } = mount(view("amount"));
		expect(fullOption().series?.[0]?.data).toMatchObject([
			{ value: 125 },
			{ value: "-" },
			{ value: 0 },
		]);
		expect(chart().actions.at(-1)).toMatchObject({
			type: "showTip",
			dataIndex: 0,
		});
		expect(
			fullOption().tooltip?.formatter?.({ name: "amount", value: 125 }),
		).toContain("$1.25");
		act(() => root.render(view("absent")));
		expect(chart().actions.at(-1)?.type).toBe("hideTip");
		act(() => root.render(view(null)));
		expect(chart().actions.at(-1)?.type).toBe("hideTip");
	});

	test("pie selection preserves zero and rejects missing values", () => {
		const selected: ({ dataKey: string; value: number } | null)[] = [];
		mount(
			<Pie
				data={[
					{ name: "zero", value: 0 },
					{ name: "missing", value: null },
					{ name: "invalid", value: Infinity },
				]}
				config={config}
				nameKey="name"
				dataKey="value"
				onSelectionChange={(value) => selected.push(value)}
			>
				<Pie.Pie isClickable />
			</Pie>,
		);
		act(() => chart().emit("click", { name: "missing" }));
		act(() => chart().emit("click", { name: "invalid" }));
		expect(selected).toEqual([]);
		act(() => chart().emit("click", { name: "zero" }));
		expect(selected).toEqual([{ dataKey: "zero", value: 0 }]);
	});

	test("reduced motion stops native skeleton and animated dash loops", () => {
		reducedMotion = true;
		const view = (loading: boolean) => (
			<Area
				data={[{ day: "a", amount: 5 }]}
				config={config}
				isLoading={loading}
			>
				<Area.Area dataKey="amount" strokeVariant="animated-dashed" />
			</Area>
		);
		const { root, container } = mount(view(true));
		expect(values("__loading")?.length).toBeGreaterThan(0);
		expect(container.textContent).not.toContain("Loading");
		expect(container.querySelector(".animate-spin")).toBeNull();
		expect(frames.size).toBe(0);
		act(() => root.render(view(false)));
		expect(fullOption().animation).toBe(false);
		expect(frames.size).toBe(0);
	});

	test("reduced motion changes stop a running skeleton without a parent render", () => {
		mount(
			<Bar data={[{ day: "a", amount: 2 }]} config={config} isLoading>
				<Bar.Bar dataKey="amount" />
			</Bar>,
		);
		expect(frames.size).toBe(1);
		act(() => {
			reducedMotion = true;
			mediaSubscribers.forEach((notify) => {
				notify();
			});
		});
		expect(frames.size).toBe(0);
		expect(fullOption().animation).toBe(false);
	});

	test("suspended renders never expose speculative props to chart callbacks", () => {
		const committed: (string | null)[] = [];
		const speculative: (string | null)[] = [];
		const blocked = new Promise<never>(() => {});
		function Block({ suspend }: { suspend: boolean }) {
			if (suspend) throw blocked;
			return null;
		}
		const view = (suspend: boolean, select: (key: string | null) => void) => (
			<Suspense fallback={null}>
				<Bar
					data={[{ day: "a", amount: suspend ? 9 : 2 }]}
					config={config}
					onSelectionChange={select}
				>
					<Bar.Bar dataKey="amount" isClickable />
				</Bar>
				<Block suspend={suspend} />
			</Suspense>
		);
		const { root } = mount(view(false, (key) => committed.push(key)));
		act(() => {
			startTransition(() =>
				root.render(view(true, (key) => speculative.push(key))),
			);
		});
		expect(values("amount")).toEqual([2]);
		act(() => chart().emit("click", { seriesId: "amount" }));
		expect(committed).toEqual(["amount"]);
		expect(speculative).toEqual([]);
	});

	test("loading loops clean up after updates, renderer changes, and unmount", () => {
		const view = (renderer: "canvas" | "svg") => (
			<Pie
				data={[{ name: "amount", value: 2 }]}
				config={config}
				nameKey="name"
				dataKey="value"
				renderer={renderer}
				isLoading
			>
				<Pie.Pie />
			</Pie>
		);
		const { root } = mount(view("canvas"));
		expect(frames.size).toBe(1);
		flushFrames();
		act(() => root.render(view("svg")));
		expect(frames.size).toBe(1);
		expect(charts[0]?.disposed).toBe(true);
		flushFrames();
	});

	test("tooltip HTML escapes plain labels, values, and titles", () => {
		const text = `<img src=x onerror="alert('x')">&`;
		const row = tooltipRow({
			indicatorHtml: "<i></i>",
			labelText: text,
			valueText: text,
			dimmed: "",
		});
		const html = tooltipShell({
			label: text,
			body: row,
			roundness: "lg",
			variant: "default",
		});
		const container = document.createElement("div");
		container.innerHTML = html;
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector("i")).not.toBeNull();
		expect(container.textContent?.split(text).length).toBe(4);
		mount(
			<Pie
				data={[{ name: text, value: 1 }]}
				config={{ [text]: { label: text } }}
				dataKey="value"
				nameKey="name"
			>
				<Pie.Pie />
				<Pie.Tooltip valueFormatter={() => text} />
			</Pie>,
		);
		container.innerHTML =
			fullOption().tooltip?.formatter?.({ name: text, value: 1 }) ?? "";
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toContain(text);
	});

	test("real ECharts renders generated area, bar, and pie options as SVG", () => {
		const views = [
			<Area
				key="area"
				data={[
					{ day: "a", amount: 0 },
					{ day: "b", amount: 3 },
				]}
				config={config}
			>
				<Area.Area dataKey="amount" />
				<Area.XAxis dataKey="day" />
				<Area.YAxis />
				<Area.Grid />
				<Area.Tooltip />
			</Area>,
			<Bar
				key="bar"
				data={[
					{ day: "a", amount: 0 },
					{ day: "b", amount: 3 },
				]}
				config={config}
			>
				<Bar.Bar dataKey="amount" variant="stripped" />
				<Bar.XAxis dataKey="day" />
				<Bar.YAxis />
				<Bar.Tooltip />
			</Bar>,
			<Pie
				key="pie"
				data={[{ name: "amount", value: 3 }]}
				config={config}
				nameKey="name"
				dataKey="value"
			>
				<Pie.Pie innerRadius="60%" />
				<Pie.Tooltip />
			</Pie>,
		];
		for (const view of views) {
			mount(view);
			const instance = nativeInit(null, null, {
				renderer: "svg",
				ssr: true,
				width: 500,
				height: 300,
			});
			try {
				instance.setOption({ ...fullOption(), animation: false });
				const svg = instance.renderToSVGString();
				expect(svg).toContain("<svg");
				expect(svg).toContain("<path");
				expect(svg).not.toContain("NaN");
				expect(svg).not.toContain("undefined");
			} finally {
				instance.dispose();
			}
		}
	});

	test("keyboard tooltip actions resolve series IDs after inserted companion series", () => {
		mount(
			<Area
				data={[
					{ day: "a", amount: 1 },
					{ day: "b", amount: 2 },
				]}
				config={config}
				activeIndex={1}
				enableHoverReveal
			>
				<Area.Area dataKey="amount" />
				<Area.Tooltip />
			</Area>,
		);
		expect(fullOption().series?.[0]?.id).toBe("__reveal-amount");
		expect(chart().actions.at(-1)).toMatchObject({
			type: "showTip",
			seriesIndex: 1,
			dataIndex: 1,
		});
		expect(chart().actions.at(-2)).toMatchObject({
			type: "highlight",
			seriesId: "amount",
			dataIndex: 1,
		});
	});

	test("replacing a container recreates the chart without remounting its hooks", () => {
		function Container({ revision }: { revision: number }) {
			const container = useRef<HTMLDivElement | null>(null);
			const setup = useCallback(() => {
				const instance = new TestChart("canvas");
				charts.push(instance);
				return () => {
					instance.dispose();
				};
			}, []);
			const ref = useChartLifecycle(
				{ prepare: () => {}, setup, synchronize: () => {}, animate: [] },
				container,
			);
			return <div key={revision} ref={ref} />;
		}
		const { root } = mount(<Container revision={0} />);
		const previous = chart();
		act(() => root.render(<Container revision={1} />));
		expect(charts.length).toBe(2);
		expect(previous.disposed).toBe(true);
		expect(chart().disposed).toBe(false);
	});

	test("native updates preserve the tooltip view and remove obsolete series and brush axes", () => {
		const view = (extra: boolean) => (
			<Area
				data={[
					{ day: "a", amount: 1, second: 2 },
					{ day: "b", amount: 2, second: 3 },
				]}
				config={{ ...config, second: config.amount }}
			>
				<Area.Area dataKey="amount" />
				{extra && <Area.Area dataKey="second" />}
				<Area.XAxis dataKey="day" />
				<Area.Tooltip />
				{extra && <Area.Brush />}
			</Area>
		);
		const { root } = mount(view(true));
		const instance = nativeInit(null, null, {
			renderer: "svg",
			ssr: true,
			width: 500,
			height: 300,
		});
		try {
			setChartOption(instance, { ...fullOption(), animation: false });
			const tooltip = instance.getModel().getComponent("tooltip");
			expect(instance.getOption().series.length).toBe(4);
			act(() => root.render(view(false)));
			setChartOption(instance, { ...fullOption(), animation: false });
			expect(instance.getModel().getComponent("tooltip")).toBe(tooltip);
			expect(
				instance
					.getOption()
					.series.filter(Boolean)
					.map((series: Series) => series.id),
			).toEqual(["amount"]);
			expect(instance.getOption().xAxis.filter(Boolean).length).toBe(1);
			expect(instance.getOption().dataZoom.filter(Boolean).length).toBe(0);
		} finally {
			instance.dispose();
		}
	});

	test("native showTip actions display axis tooltip content through resolved series indices", () => {
		mount(
			<Area
				data={[
					{ day: "a", amount: 125 },
					{ day: "b", amount: 250 },
				]}
				config={config}
			>
				<Area.Area dataKey="amount" />
				<Area.XAxis dataKey="day" />
				<Area.Tooltip
					valueFormatter={(value) => `USD ${(value / 100).toFixed(2)}`}
				/>
			</Area>,
		);
		const container = document.createElement("div");
		document.body.append(container);
		const instance = nativeInit(container, null, {
			renderer: "svg",
			width: 500,
			height: 300,
		});
		try {
			setChartOption(instance, { ...fullOption(), animation: false });
			showActiveIndex(instance, 1, "amount");
			expect(container.textContent).toContain("USD 2.50");
			expect(instance.getOption().xAxis[0].axisPointer.status).toBe("show");
		} finally {
			instance.dispose();
		}
	});

	test("native pie keyboard navigation keeps every donut sector tooltip visible after refresh", async () => {
		nativeFixtures = true;
		const rows = [
			{ name: "first", value: 6200000 },
			{ name: "second", value: 3800000 },
			{ name: "Decision maker in", value: 7600000 },
			{ name: "fourth", value: 2400000 },
		];
		function KeyboardPie() {
			const [index, setIndex] = useState<number | null>(null);
			return (
				<div
					role="application"
					aria-label="Donut keyboard test"
					onKeyDown={(event) => {
						if (event.key === "Home") setIndex(0);
						if (event.key === "ArrowRight")
							setIndex((previous) => ((previous ?? -1) + 1) % rows.length);
						if (event.key === "ArrowLeft")
							setIndex(
								(previous) => ((previous ?? 1) + rows.length - 1) % rows.length,
							);
					}}
				>
					<Pie
						data={rows}
						config={{}}
						nameKey="name"
						dataKey="value"
						renderer="svg"
						animation={false}
						activeSector={index === null ? null : rows[index]?.name}
					>
						<Pie.Pie
							innerRadius="72%"
							outerRadius="100%"
							cornerRadius={4}
							paddingAngle={2}
						/>
						<Pie.Tooltip
							position="bottom"
							valueFormatter={(value) =>
								`$${(value / 100).toLocaleString("en-US")}`
							}
						/>
					</Pie>
				</div>
			);
		}
		const { container } = mount(<KeyboardPie />);
		const host = container.firstElementChild;
		if (!host) throw new Error("Keyboard host is missing.");
		let expectedIndex = 0;
		for (const key of [
			"Home",
			"ArrowRight",
			"ArrowRight",
			"ArrowRight",
			"ArrowLeft",
		]) {
			await act(async () => {
				host.dispatchEvent(
					new browser.KeyboardEvent("keydown", { key, bubbles: true }),
				);
			});
			await new Promise<void>((resolve) => setTimeout(resolve, 150));
			const tooltip = container.querySelector(".grid.min-w-32")?.parentElement;
			expect(tooltip).not.toBeNull();
			expect(tooltip?.style.display).not.toBe("none");
			if (key === "Home") expectedIndex = 0;
			if (key === "ArrowRight")
				expectedIndex = (expectedIndex + 1) % rows.length;
			if (key === "ArrowLeft")
				expectedIndex = (expectedIndex + rows.length - 1) % rows.length;
			const expected = rows[expectedIndex];
			expect(tooltip?.textContent).toContain(expected?.name);
			expect(tooltip?.textContent).toContain(
				`$${((expected?.value ?? 0) / 100).toLocaleString("en-US")}`,
			);
			expect(tooltip?.querySelector(".font-medium.text-primary")).toBeNull();
			for (const label of tooltip?.querySelectorAll("span") ?? [])
				expect(label.textContent?.trim()).not.toBe("");
		}
		expect(container.textContent).toContain("$76,000");
	});

	test("native area pointer leave restores the keyboard tooltip after globalout", async () => {
		nativeFixtures = true;
		const rows = [
			{ day: "Jun", amount: 11800000 },
			{ day: "Jul", amount: 5000000 },
		];
		const parts = [
			<Area.Area key="area" dataKey="amount" />,
			<Area.XAxis key="axis" dataKey="day" />,
			<Area.Tooltip key="tooltip" />,
		];
		function PointerArea() {
			const [, setPointer] = useState<number | null>(null);
			return (
				<Area
					data={rows}
					config={config}
					renderer="svg"
					animation={false}
					activeIndex={0}
					onHoverIndexChange={setPointer}
				>
					{parts}
				</Area>
			);
		}
		const { container } = mount(<PointerArea />);
		const instance = [...nativeInstances].at(-1);
		if (!instance) throw new Error("Native chart is missing.");
		const point = instance.convertToPixel({ gridIndex: 0 }, [1, 5000000]);
		act(() =>
			instance
				.getZr()
				.trigger("mousemove", { offsetX: point[0], offsetY: point[1] }),
		);
		act(() => instance.getZr().trigger("globalout", {}));
		await new Promise<void>((resolve) => setTimeout(resolve, 150));
		expect(instance.getOption().xAxis[0].axisPointer.status).toBe("show");
		const tooltip = container.querySelector(".grid.min-w-32")?.parentElement;
		expect(tooltip?.style.display).not.toBe("none");
		expect(tooltip?.textContent).toContain("Jun");
	});

	test("bottom tooltip positions stay bounded and preserve fixed and variable modes", () => {
		const bottom = resolveTooltipPosition(
			"bottom",
		) as TooltipComponentPositionCallback;
		const fixed = resolveTooltipPosition(
			"fixed",
		) as TooltipComponentPositionCallback;
		const dom = document.createElement("div");
		const size = { contentSize: [120, 40], viewSize: [200, 168] };
		expect(bottom([10, 50], [], dom, null, size)).toEqual([0, 120]);
		expect(bottom([190, 50], [], dom, null, size)).toEqual([80, 120]);
		expect(
			bottom([50, 50], [], dom, null, {
				contentSize: [300, 200],
				viewSize: [200, 168],
			}),
		).toEqual([-50, 0]);
		expect(fixed([100, 50], [], dom, null, size)).toEqual([40, 8]);
		expect(resolveTooltipPosition("variable")).toBeUndefined();
	});

	test("primitive values and theme arrays keep finite values and upstream color slots", () => {
		expect(
			[0, null, undefined, "5", false, Infinity, Number.NaN].map(finiteValue),
		).toEqual([0, null, null, null, null, null, null]);
		expect(
			Number.isFinite(finiteSum([Number.MAX_VALUE, Number.MAX_VALUE])),
		).toBe(true);
		expect(
			buildChartCss("chart-test", {
				amount: { colors: { light: ["red", "blue"], dark: ["white"] } },
			}),
		).toContain("--color-amount-1: white;");
		expect(normalizeColor("oklch(0.6 0.1 150)")).toBe("oklch(0.6 0.1 150)");
	});
}
