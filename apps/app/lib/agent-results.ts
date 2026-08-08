import type { TranscriptItem } from "./agent-transcript";

export type AnchoredResult<T> = { itemId: string; value: T };

export function anchorResults<T>({
	items,
	tool,
	validate,
	group,
}: {
	items: readonly TranscriptItem[];
	tool: string;
	validate: (output: unknown) => T | null;
	group?: (
		results: readonly AnchoredResult<T>[],
	) => readonly AnchoredResult<T>[];
}): Map<string, T[]> {
	const valid: AnchoredResult<T>[] = [];

	for (const item of items) {
		if (item.kind !== "did" || item.tool !== tool || item.pending) continue;
		const value = validate(item.output);
		if (value !== null) valid.push({ itemId: item.id, value });
	}

	const anchored = group ? group(valid) : valid;
	const byAnchor = new Map<string, T[]>();

	for (const { itemId, value } of anchored) {
		const bucket = byAnchor.get(itemId);
		if (bucket) bucket.push(value);
		else byAnchor.set(itemId, [value]);
	}

	return byAnchor;
}
