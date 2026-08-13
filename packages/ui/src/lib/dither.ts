export type Bloom = "off" | "low" | "high" | "aura";

const BLOOM_CLASS = {
	off: "",
	low: "bloom-low",
	high: "bloom-high",
	aura: "bloom-aura",
} as const satisfies Record<Bloom, string>;

export function bloomClass(bloom: Bloom = "off"): string {
	return BLOOM_CLASS[bloom];
}
