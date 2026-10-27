"use client";
import * as echarts from "echarts/core";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import type { ComponentType, ReactNode } from "react";
export const ECHARTS_RENDERERS = {
	canvas: "canvas",
	svg: "svg",
} as const;
export type EChartsRenderer =
	(typeof ECHARTS_RENDERERS)[keyof typeof ECHARTS_RENDERERS];
export const DEFAULT_ECHARTS_RENDERER = ECHARTS_RENDERERS.canvas;
echarts.use([CanvasRenderer, SVGRenderer]);
export const THEMES = { light: "", dark: ".dark" } as const;
export type ThemeKey = keyof typeof THEMES;
export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];
export type AtLeastOneThemeColor =
	| {
			light: string[];
			dark?: string[];
	  }
	| {
			light?: string[];
			dark: string[];
	  };
export type ChartValue = string | number | boolean | null | undefined;
export type ChartRow = Record<string, ChartValue>;

export function finiteValue(value: ChartValue): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function finiteSum(values: number[]): number {
	const total = values.reduce((sum, value) => sum + value, 0);
	return Number.isFinite(total) ? total : 0;
}

export type ChartConfig = Record<
	string,
	{
		label?: ReactNode;
		icon?: ComponentType;
		colors?: AtLeastOneThemeColor;
	}
>;
export function getColorsCount(item: ChartConfig[string]): number {
	if (!item.colors) return 1;
	const counts = THEME_KEYS.map((theme) => item.colors?.[theme]?.length ?? 0);
	return Math.max(...counts, 1);
}
export function distributeColors(colors: string[], maxCount: number): string[] {
	const available = colors.length;
	if (!available || maxCount < 1) return [];
	if (available >= maxCount) return colors.slice(0, maxCount);
	const result: string[] = [];
	const baseSlots = Math.floor(maxCount / available);
	const extraSlots = maxCount % available;
	for (let i = 0; i < available; i++) {
		const isExtra = i >= available - extraSlots;
		const slots = baseSlots + (isExtra ? 1 : 0);
		for (let j = 0; j < slots; j++) result.push(colors[i] ?? "transparent");
	}
	return result;
}
export function buildChartCss(id: string, config: ChartConfig): string {
	const colorConfig = Object.entries(config).filter(([, item]) => item.colors);
	if (!colorConfig.length) return "";
	const varsFor = (theme: ThemeKey) =>
		colorConfig
			.flatMap(([key, item]) => {
				const authored = item.colors?.[theme];
				if (!authored || authored.length === 0) return [];
				return distributeColors(authored, getColorsCount(item)).map(
					(color, index) => `  --color-${key}-${index}: ${color};`,
				);
			})
			.join("\n");
	return Object.entries(THEMES)
		.map(
			([theme, prefix]) =>
				`${prefix} [data-chart=${id}] {\n${varsFor(theme as ThemeKey)}\n}`,
		)
		.join("\n");
}
let normalizerCtx: CanvasRenderingContext2D | null = null;
export function normalizeColor(value: string): string {
	const raw = value.trim();
	if (!raw || typeof document === "undefined") return raw;
	if (!normalizerCtx) {
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		normalizerCtx = canvas.getContext("2d", { willReadFrequently: true });
	}
	if (!normalizerCtx) return raw;
	normalizerCtx.clearRect(0, 0, 1, 1);
	normalizerCtx.fillStyle = "#000";
	normalizerCtx.fillStyle = raw;
	normalizerCtx.fillRect(0, 0, 1, 1);
	const [r = 0, g = 0, b = 0, a = 255] = normalizerCtx.getImageData(
		0,
		0,
		1,
		1,
	).data;
	return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}
export function withAlpha(color: string, alpha: number): string {
	const match = color.match(/rgba?\(([^)]+)\)/);
	if (!match) return color;
	const [r, g, b, a] = (match[1] ?? "").split(",").map((p) => p.trim());
	const base = a === undefined ? 1 : Number.parseFloat(a) || 0;
	return `rgba(${r}, ${g}, ${b}, ${(base * alpha).toFixed(3)})`;
}
export type ResolvedColors = {
	series: Record<string, string[]>;
	tokens: {
		mutedForeground: string;
		border: string;
		foreground: string;
		background: string;
	};
};
export function resolveColors(
	container: HTMLElement,
	config: ChartConfig,
	seriesKeys: string[],
): ResolvedColors {
	const computed = getComputedStyle(container);
	const series: Record<string, string[]> = {};
	for (const key of seriesKeys) {
		const count = getColorsCount(config[key] ?? {});
		const slots: string[] = [];
		for (let n = 0; n < count; n++) {
			const raw = computed.getPropertyValue(`--color-${key}-${n}`).trim();
			slots.push(raw ? normalizeColor(raw) : "rgba(120, 120, 120, 1)");
		}
		series[key] = slots;
	}
	const probe = document.createElement("span");
	probe.style.cssText =
		"position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;";
	container.appendChild(probe);
	const readToken = (className: string) => {
		probe.className = className;
		return normalizeColor(getComputedStyle(probe).color);
	};
	const tokens = {
		mutedForeground: readToken("text-muted-foreground"),
		border: readToken("text-border"),
		foreground: readToken("text-foreground"),
		background: readToken("text-background"),
	};
	container.removeChild(probe);
	return { series, tokens };
}
export function seriesPaint(
	slots: string[],
): string | echarts.graphic.LinearGradient {
	if (slots.length <= 1) return slots[0] ?? "rgba(120, 120, 120, 1)";
	const stops = slots.map((color, i) => ({
		offset: i / (slots.length - 1),
		color,
	}));
	return new echarts.graphic.LinearGradient(0, 0, 1, 0, stops);
}
export function indicatorBackground(key: string, colorsCount: number): string {
	if (colorsCount <= 1) return `var(--color-${key}-0)`;
	const stops = Array.from({ length: colorsCount }, (_, i) => {
		const offset = (i / (colorsCount - 1)) * 100;
		return `var(--color-${key}-${i}) ${offset}%`;
	}).join(", ");
	return `linear-gradient(to right, ${stops})`;
}
export function flattenColor(color: string, base: string): string {
	const parse = (value: string) =>
		value
			.match(/rgba?\(([^)]+)\)/)?.[1]
			?.split(",")
			.map((part) => Number.parseFloat(part)) ?? [0, 0, 0, 1];
	const [r = 0, g = 0, b = 0, a = 1] = parse(color);
	const [baseR = 0, baseG = 0, baseB = 0] = parse(base);
	const mix = (channel: number, baseChannel: number) =>
		Math.round(channel * a + baseChannel * (1 - a));
	return `rgb(${mix(r, baseR)}, ${mix(g, baseG)}, ${mix(b, baseB)})`;
}
