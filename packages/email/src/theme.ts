export const EMAIL_THEME = {
	brand: "#006B4F",
	brandText: "#ffffff",
	foreground: "#18181b",
	body: "#3f3f46",
	muted: "#71717a",
	border: "#e4e4e7",
	surface: "#ffffff",
	surfaceMuted: "#fafafa",
	page: "#f4f4f5",
} as const;

export const EMAIL_WIDTH = 600;
export const EMAIL_PADDING_X = 28;
export const EMAIL_CONTENT_WIDTH = EMAIL_WIDTH - EMAIL_PADDING_X * 2;

function channel(hex: string, at: number): number {
	const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
	return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
	const clean = hex.replace("#", "");
	if (clean.length !== 6) return 0;
	return (
		0.2126 * channel(clean, 0) +
		0.7152 * channel(clean, 2) +
		0.0722 * channel(clean, 4)
	);
}

export function contrast(a: string, b: string): number {
	const first = luminance(a);
	const second = luminance(b);
	const lighter = Math.max(first, second);
	const darker = Math.min(first, second);
	return (lighter + 0.05) / (darker + 0.05);
}

export function darkenUntilReadable(hex: string, against = "#ffffff"): string {
	const clean = hex.replace("#", "");
	if (clean.length !== 6) return EMAIL_THEME.brand;

	let r = Number.parseInt(clean.slice(0, 2), 16);
	let g = Number.parseInt(clean.slice(2, 4), 16);
	let b = Number.parseInt(clean.slice(4, 6), 16);

	for (let step = 0; step < 40; step += 1) {
		const candidate = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
		if (contrast(candidate, against) >= 4.5) return candidate;
		r = Math.max(0, Math.round(r * 0.9));
		g = Math.max(0, Math.round(g * 0.9));
		b = Math.max(0, Math.round(b * 0.9));
	}

	return "#111827";
}
