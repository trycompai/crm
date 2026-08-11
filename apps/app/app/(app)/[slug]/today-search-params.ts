import { createLoader, parseAsString } from "nuqs/server";

export const todaySearchParams = {
	approval: parseAsString,
};

export const loadTodaySearchParams = createLoader(todaySearchParams);

export function todayFocusHistory(open: boolean): "push" | "replace" {
	return open ? "push" : "replace";
}
