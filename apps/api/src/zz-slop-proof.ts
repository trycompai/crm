export type SlopBag = Record<string, unknown>;

export function readSlop(value: unknown): SlopBag {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as SlopBag;
	}
	return {};
}

export function slopName(value: unknown): string | null {
	const bag = readSlop(value);
	return typeof bag.name === "string" ? bag.name : null;
}
