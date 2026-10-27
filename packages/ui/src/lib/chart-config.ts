export type ChartColor = { light: string; dark: string };

const COLORS = {
	emerald: { light: "#059669", dark: "#34d399" },
	neutral: { light: "#71717a", dark: "#a1a1aa" },
	stage1: { light: "#a7f3d0", dark: "#065f46" },
	stage2: { light: "#6ee7b7", dark: "#047857" },
	stage3: { light: "#10b981", dark: "#10b981" },
	stage4: { light: "#047857", dark: "#6ee7b7" },
} as const satisfies Record<string, ChartColor>;

export const CHART_CONFIG = {
	trend: {
		won: COLORS.emerald,
		created: COLORS.neutral,
	},
	stages: [COLORS.stage1, COLORS.stage2, COLORS.stage3, COLORS.stage4],
	fallback: COLORS.neutral,
	height: {
		area: 200,
		bar: 180,
		donut: 200,
		dashboardTrend: 196,
		dashboardDonut: 168,
	},
	area: {
		curve: "monotone",
		stroke: "solid",
		strokeWidth: 1.5,
	},
	bar: {
		radius: 4,
	},
	donut: {
		innerRadius: "72%",
		outerRadius: "100%",
		cornerRadius: 4,
		paddingAngle: 2,
	},
} as const satisfies {
	trend: Record<string, ChartColor>;
	stages: readonly ChartColor[];
	fallback: ChartColor;
	height: Record<string, number>;
	area: { curve: string; stroke: string; strokeWidth: number };
	bar: { radius: number };
	donut: {
		innerRadius: string;
		outerRadius: string;
		cornerRadius: number;
		paddingAngle: number;
	};
};

export function chartSwatch(color: ChartColor): string {
	return `light-dark(${color.light}, ${color.dark})`;
}

export function chartThemeColors(color: ChartColor) {
	return { light: [color.light], dark: [color.dark] };
}

export function stageChartColor(index: number): ChartColor {
	return CHART_CONFIG.stages[index] ?? CHART_CONFIG.fallback;
}
