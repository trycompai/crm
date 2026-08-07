"use client";

import { useEffect, useRef, useState } from "react";

export function useSearchInput(
	committed: string,
	commit: (value: string) => void,
	delayMs = 250,
) {
	const [state, setState] = useState({ committed, value: committed });
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	let value = state.value;

	if (state.committed !== committed) {
		value = committed;
		setState({ committed, value: committed });
	}

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const change = (next: string) => {
		setState({ committed, value: next });
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => commit(next), delayMs);
	};

	return [value, change] as const;
}
