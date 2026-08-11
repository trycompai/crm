const TODAY_LABEL = "today";
const WORK_LABEL = "work";

export function showTodayNavigation(query: string): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	return normalized === "" || TODAY_LABEL.startsWith(normalized);
}

export function showWorkNavigation(query: string): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	return normalized === "" || WORK_LABEL.startsWith(normalized);
}
