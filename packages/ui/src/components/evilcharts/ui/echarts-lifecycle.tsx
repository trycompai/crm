"use client";

import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import type { EChartsType } from "echarts/core";
import {
	type RefObject,
	useCallback,
	useRef,
	useSyncExternalStore,
} from "react";

import { seriesIndexForId } from "./echarts-options";

type Cleanup = (() => void) | undefined;
type LifecycleTask = (() => void) | (() => () => void);
type LifecycleProps = {
	prepare: () => void;
	setup: LifecycleTask;
	synchronize: LifecycleTask;
	animate: readonly LifecycleTask[];
};

class ChartLifecycle {
	private current: LifecycleProps | null = null;
	private initialized = false;
	private disposeChart: Cleanup;
	private disposeSynchronization: Cleanup;
	private animations: Cleanup[] = [];

	resume() {
		if (this.current && !this.initialized) this.commit(this.current);
	}

	commit(next: LifecycleProps) {
		const previous = this.current;
		this.current = next;
		next.prepare();
		if (!this.initialized || !previous) {
			this.initialized = true;
			this.disposeChart = next.setup() || undefined;
			this.disposeSynchronization = next.synchronize() || undefined;
			this.animations = next.animate.map((task) => task() || undefined);
			return;
		}
		const recreate = previous.setup !== next.setup;
		const synchronize = recreate || previous.synchronize !== next.synchronize;
		for (let index = 0; index < this.animations.length; index++) {
			if (recreate || previous.animate[index] !== next.animate[index]) {
				this.animations[index]?.();
				this.animations[index] = undefined;
			}
		}
		if (synchronize) {
			this.disposeSynchronization?.();
			this.disposeSynchronization = undefined;
		}
		if (recreate) {
			this.disposeChart?.();
			this.disposeChart = next.setup() || undefined;
		}
		if (synchronize)
			this.disposeSynchronization = next.synchronize() || undefined;
		next.animate.forEach((task, index) => {
			if (recreate || previous.animate[index] !== task)
				this.animations[index] = task() || undefined;
		});
	}

	dispose() {
		this.animations.forEach((cleanup) => {
			cleanup?.();
		});
		this.animations = [];
		this.disposeSynchronization?.();
		this.disposeSynchronization = undefined;
		this.disposeChart?.();
		this.disposeChart = undefined;
		this.initialized = false;
	}
}

export function useChartLifecycle(
	props: LifecycleProps,
	container: RefObject<HTMLDivElement | null>,
) {
	const lifecycleRef = useRef<ChartLifecycle | null>(null);
	const mountedNode = useRef<HTMLDivElement | null>(null);
	if (!lifecycleRef.current) lifecycleRef.current = new ChartLifecycle();
	const lifecycle = lifecycleRef.current;
	useMountEffect(() => {
		lifecycle.resume();
		return () => lifecycle.dispose();
	});
	return useCallback(
		(node: HTMLDivElement | null) => {
			container.current = node;
			if (node) {
				if (mountedNode.current !== null && mountedNode.current !== node)
					lifecycle.dispose();
				mountedNode.current = node;
				lifecycle.commit(props);
			}
		},
		[container, lifecycle, mountedNode, props],
	);
}

export function observeChartTheme(container: HTMLElement, refresh: () => void) {
	const observer = new MutationObserver(refresh);
	for (
		let element: HTMLElement | null = container;
		element;
		element = element.parentElement
	) {
		observer.observe(element, {
			attributes: true,
			attributeFilter: ["class", "style", "data-theme"],
		});
	}
	return observer;
}

export function boundedIndex(
	index: number | null | undefined,
	length: number,
): number | null {
	return typeof index === "number" &&
		Number.isInteger(index) &&
		index >= 0 &&
		index < length
		? index
		: null;
}

const activeTooltipTimers = new WeakMap<
	EChartsType,
	ReturnType<typeof setTimeout>
>();

export function cancelActiveTooltip(chart: EChartsType) {
	const timer = activeTooltipTimers.get(chart);
	if (timer !== undefined) clearTimeout(timer);
	activeTooltipTimers.delete(chart);
}

export function showActiveIndex(
	chart: EChartsType,
	index: number | null,
	seriesId?: string,
) {
	cancelActiveTooltip(chart);
	chart.dispatchAction({ type: "downplay", seriesId }, { silent: true });
	chart.dispatchAction({ type: "hideTip" }, { silent: true });
	if (index === null) return;
	const seriesIndex = seriesId ? seriesIndexForId(chart, seriesId) : 0;
	if (seriesIndex < 0) return;
	const target = seriesId ? { seriesId } : { seriesIndex };
	chart.dispatchAction(
		{ type: "highlight", ...target, dataIndex: index },
		{ silent: true },
	);
	const show = () => {
		chart.dispatchAction(
			{ type: "showTip", seriesIndex, dataIndex: index },
			{ silent: true },
		);
	};
	show();
	activeTooltipTimers.set(
		chart,
		setTimeout(() => {
			activeTooltipTimers.delete(chart);
			if (!chart.isDisposed()) show();
		}, 0),
	);
}

function readReducedMotion() {
	return (
		typeof window === "undefined" ||
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function subscribeReducedMotion(notify: () => void) {
	const media = window.matchMedia("(prefers-reduced-motion: reduce)");
	media.addEventListener("change", notify);
	return () => media.removeEventListener("change", notify);
}

export function useReducedMotion() {
	return useSyncExternalStore(
		subscribeReducedMotion,
		readReducedMotion,
		readReducedMotion,
	);
}
