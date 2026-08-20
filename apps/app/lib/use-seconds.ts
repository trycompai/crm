"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 1_000;

const listeners = new Set<() => void>();

let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

export function useSeconds(): number {
	return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}

function subscribe(listener: () => void) {
	listeners.add(listener);

	if (timer === null) {
		now = Date.now();
		timer = setInterval(tick, TICK_MS);
	}

	return () => {
		listeners.delete(listener);

		if (listeners.size === 0 && timer !== null) {
			clearInterval(timer);
			timer = null;
		}
	};
}

function tick() {
	now = Date.now();
	for (const listener of listeners) listener();
}

function clientSnapshot() {
	return now;
}

function serverSnapshot() {
	return 0;
}
