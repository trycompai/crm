"use client";

import { useSyncExternalStore } from "react";

export function useHydrated() {
	return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}

function subscribe() {
	return () => undefined;
}

function clientSnapshot() {
	return true;
}

function serverSnapshot() {
	return false;
}
