"use client";

import { useEffect, useRef, useState } from "react";

export function useSearchInput(
	committed: string,
	commit: (value: string) => void,
	delayMs = 250,
) {
	const [value, setValue] = useState(committed);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const change = (next: string) => {
		setValue(next);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => commit(next), delayMs);
	};

	return [value, change] as const;
}
