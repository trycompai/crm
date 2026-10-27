const PALETTES = [
	["#d1fae5", "#34d399", "#047857"],
	["#dcfce7", "#4ade80", "#166534"],
	["#ccfbf1", "#2dd4bf", "#0f766e"],
	["#e4ece6", "#8fb39b", "#3e6a4f"],
	["#e7ebe9", "#98a6a0", "#3c4a45"],
] as const;

export type SeedPalette = (typeof PALETTES)[number];

export function seedHash(seed: string): number {
	let value = 0x811c9dc5;

	for (const char of seed.trim().toLowerCase()) {
		value ^= char.codePointAt(0) ?? 0;
		value = Math.imul(value, 0x01000193);
	}

	value ^= value >>> 16;
	value = Math.imul(value, 0x85ebca6b);
	value ^= value >>> 13;
	value = Math.imul(value, 0xc2b2ae35);
	value ^= value >>> 16;

	return value >>> 0;
}

export function seedPalette(value: number): SeedPalette {
	return PALETTES[value % PALETTES.length] ?? PALETTES[0];
}
