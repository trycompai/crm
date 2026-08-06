"use client";

import { useCallback, useMemo, useState } from "react";

const EMPTY: ReadonlySet<string> = new Set();

export type TableSelection = {
	ids: string[];
	count: number;
	has: (id: string) => boolean;
	toggle: (id: string, selected: boolean) => void;
	toggleAll: (selected: boolean) => void;
	clear: () => void;
	allSelected: boolean;
	someSelected: boolean;
};

export function useTableSelection(rowIds: string[]): TableSelection {
	const [picked, setPicked] = useState<ReadonlySet<string>>(EMPTY);

	const ids = useMemo(
		() => rowIds.filter((id) => picked.has(id)),
		[rowIds, picked],
	);

	const has = useCallback((id: string) => picked.has(id), [picked]);

	const toggle = useCallback((id: string, selected: boolean) => {
		setPicked((prev) => {
			const next = new Set(prev);
			if (selected) next.add(id);
			else next.delete(id);
			return next;
		});
	}, []);

	const toggleAll = useCallback(
		(selected: boolean) => {
			setPicked((prev) => {
				const next = new Set(prev);
				for (const id of rowIds) {
					if (selected) next.add(id);
					else next.delete(id);
				}
				return next;
			});
		},
		[rowIds],
	);

	const clear = useCallback(() => setPicked(EMPTY), []);

	return {
		ids,
		count: ids.length,
		has,
		toggle,
		toggleAll,
		clear,
		allSelected: rowIds.length > 0 && ids.length === rowIds.length,
		someSelected: ids.length > 0 && ids.length < rowIds.length,
	};
}
