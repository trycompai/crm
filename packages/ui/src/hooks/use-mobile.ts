import { LAYOUT } from "@crm/ui/lib/layout-config";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
	const query = window.matchMedia(LAYOUT.mobileMediaQuery);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
	return window.matchMedia(LAYOUT.mobileMediaQuery).matches;
}

function getServerSnapshot(): boolean {
	return false;
}

export function useIsMobile() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
